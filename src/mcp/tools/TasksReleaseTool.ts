import type { GitPort } from "../../git/GitPort.js";
import type { WorktreeGuard } from "../../git/WorktreeGuard.js";
import type { TaskStatusTransitions } from "../../tasks/TaskStatusTransitions.js";
import type { TaskStore } from "../../tasks/TaskStore.js";
import type { WorkflowRules } from "../../tasks/WorkflowRules.js";
import { stat } from "node:fs/promises";
import path from "node:path";

export type TasksReleaseInput = {
  project: string;
  id: string;
};

export type TaskView = {
  id: string;
  project: string;
  type: "user_story" | "bug";
  title: string;
  status: "backlog" | "todo" | "in_progress" | "done" | "canceled";
  created_at: string;
  started_at?: string;
  tool?: string;
};

export type TasksReleaseResponse =
  | { ok: true; data: TaskView }
  | { ok: false; error: { code: string; message: string; details?: object } };

export class TasksReleaseTool {
  constructor(
    private readonly _worktreeGuard: WorktreeGuard,
    private readonly _taskStore: TaskStore,
    private readonly _rules: WorkflowRules,
    private readonly _transitions: TaskStatusTransitions,
    private readonly _git: GitPort,
  ) {}

  async execute(_input: TasksReleaseInput): Promise<TasksReleaseResponse> {
    if (!isValidProjectName(_input.project)) {
      return {
        ok: false,
        error: { code: "INVALID_PROJECT_NAME", message: "Invalid project name." },
      };
    }
    if (typeof _input.id !== "string" || _input.id.trim() === "") {
      return {
        ok: false,
        error: { code: "INVALID_TASK_FORMAT", message: "Invalid task id." },
      };
    }

    const projectExists = await existsAsDirectory(this._taskStore, _input.project);
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

    if (task.status !== "in_progress") {
      return {
        ok: false,
        error: {
          code: "INVALID_STATUS_TRANSITION",
          message: "Invalid status transition.",
        },
      };
    }

    try {
      this._rules.assertRequiredFields(task, ["started_at"]);
      this._rules.assertForbiddenFields(task, ["done_at", "canceled_at"]);
    } catch (error) {
      const code =
        error instanceof Error
          ? (error as unknown as { code?: string }).code
          : undefined;
      if (code === "INVALID_TASK_FORMAT") {
        return { ok: false, error: { code, message: "Invalid task format." } };
      }

      return {
        ok: false,
        error: { code: "INVALID_TASK_FORMAT", message: "Invalid task format." },
      };
    }

    const updated = this._transitions.toTodoReleased(task);

    try {
      await this._taskStore.write(updated);
      await this._git.commitAll(`release ${updated.id}`);
    } catch {
      return {
        ok: false,
        error: { code: "IO_ERROR", message: "Failed to release task." },
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
        started_at: updated.started_at,
        tool: updated.tool,
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
