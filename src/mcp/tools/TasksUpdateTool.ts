import type { GitPort } from "../../git/GitPort.js";
import type { WorktreeGuard } from "../../git/WorktreeGuard.js";
import type { TaskStore } from "../../tasks/TaskStore.js";
import type { TaskPatcher, TaskPatch } from "../../tasks/TaskPatcher.js";
import type { WorkflowRules } from "../../tasks/WorkflowRules.js";
import type { TaskType } from "../../tasks/TaskType.js";
import { isValidTaskId } from "../../tasks/TaskId.js";
import { stat } from "node:fs/promises";
import path from "node:path";

export type TasksUpdateInput = {
  project: string;
  id: string;
  patch: TaskPatch;
};

export type TaskView = {
  id: string;
  project: string;
  type: TaskType;
  title: string;
  status: "backlog" | "todo" | "in_progress" | "done" | "canceled";
  created_at: string;
};

export type TasksUpdateResponse =
  | { ok: true; data: TaskView }
  | { ok: false; error: { code: string; message: string; details?: object } };

export class TasksUpdateTool {
  constructor(
    private readonly _worktreeGuard: WorktreeGuard,
    private readonly _taskStore: TaskStore,
    private readonly _rules: WorkflowRules,
    private readonly _patcher: TaskPatcher,
    private readonly _git: GitPort,
  ) {}

  async execute(_input: TasksUpdateInput): Promise<TasksUpdateResponse> {
    if (!isValidProjectName(_input.project)) {
      return {
        ok: false,
        error: { code: "INVALID_PROJECT_NAME", message: "Invalid project name." },
      };
    }
    if (!isValidTaskId(_input.id)) {
      return {
        ok: false,
        error: { code: "INVALID_TASK_FORMAT", message: "Invalid task id." },
      };
    }

    const projectExists = await existsAsDirectory(
      this._taskStore,
      _input.project,
    );
    if (!projectExists) {
      return {
        ok: false,
        error: { code: "PROJECT_NOT_FOUND", message: "Project not found." },
      };
    }

    try {
      await this._worktreeGuard.assertClean();
    } catch (error) {
      const code =
        error instanceof Error
          ? (error as unknown as { code?: string }).code
          : undefined;

      if (code === "GIT_DIRTY_WORKTREE") {
        return {
          ok: false,
          error: { code: "GIT_DIRTY_WORKTREE", message: error.message },
        };
      }

      return {
        ok: false,
        error: {
          code: "GIT_OPERATION_FAILED",
          message: "Failed to check git worktree state.",
        },
      };
    }

    let task;
    try {
      task = await this._taskStore.read(_input.project, _input.id);
    } catch (error) {
      const code =
        error instanceof Error
          ? (error as unknown as { code?: string }).code
          : undefined;

      if (code === "TASK_NOT_FOUND") {
        return { ok: false, error: { code, message: "Task not found." } };
      }

      if (code === "INVALID_TASK_FORMAT") {
        return {
          ok: false,
          error: { code, message: "Invalid task format." },
        };
      }

      return {
        ok: false,
        error: { code: "IO_ERROR", message: "Failed to read task." },
      };
    }

    try {
      this._rules.assertCanUpdate(task);
    } catch (error) {
      const code =
        error instanceof Error
          ? (error as unknown as { code?: string }).code
          : undefined;

      if (code === "FORBIDDEN_UPDATE_IN_STATUS") {
        return {
          ok: false,
          error: { code, message: "Update is forbidden in this status." },
        };
      }

      return {
        ok: false,
        error: {
          code: "GIT_OPERATION_FAILED",
          message: "Failed to validate update rules.",
        },
      };
    }

    let updated;
    try {
      updated = this._patcher.apply(task, _input.patch);
    } catch (error) {
      const code =
        error instanceof Error
          ? (error as unknown as { code?: string }).code
          : undefined;

      if (code === "INVALID_TASK_FORMAT") {
        return {
          ok: false,
          error: { code, message: "Invalid task format." },
        };
      }

      return {
        ok: false,
        error: { code: "INVALID_TASK_FORMAT", message: "Invalid task format." },
      };
    }

    try {
      await this._taskStore.write(updated);
      await this._git.commitAll(`update ${updated.id}`);
    } catch {
      return {
        ok: false,
        error: { code: "IO_ERROR", message: "Failed to update task." },
      };
    }

    return {
      ok: true,
      data: {
        id: updated.id,
        project: updated.project,
        type: updated.type,
        title: updated.title,
        status: updated.status,
        created_at: updated.created_at,
      },
    };
  }
}

function isValidProjectName(name: string): boolean {
  return /^[a-z0-9-]+$/.test(name);
}

async function existsAsDirectory(
  store: TaskStore,
  project: string,
): Promise<boolean> {
  const projectDir = path.dirname(store.taskPath(project, "__probe__"));
  try {
    const info = await stat(projectDir);
    return info.isDirectory();
  } catch {
    return false;
  }
}
