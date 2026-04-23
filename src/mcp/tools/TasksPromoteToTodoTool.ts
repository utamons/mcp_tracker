import type { GitPort } from "../../git/GitPort.js";
import type { WorktreeGuard } from "../../git/WorktreeGuard.js";
import type { TaskStatusTransitions } from "../../tasks/TaskStatusTransitions.js";
import type { TaskStore } from "../../tasks/TaskStore.js";
import type { WorkflowRules } from "../../tasks/WorkflowRules.js";
import type { TaskType } from "../../tasks/TaskType.js";
import { isValidTaskId } from "../../tasks/TaskId.js";
import { stat } from "node:fs/promises";
import path from "node:path";

export type TasksPromoteToTodoInput = {
  project: string;
  id: string;
};

export type TaskView = {
  id: string;
  project: string;
  type: TaskType;
  title: string;
  status: "backlog" | "todo" | "in_progress" | "done" | "canceled";
  created_at: string;
};

export type TasksPromoteToTodoResponse =
  | { ok: true; data: TaskView }
  | { ok: false; error: { code: string; message: string; details?: object } };

export class TasksPromoteToTodoTool {
  constructor(
    private readonly _worktreeGuard: WorktreeGuard,
    private readonly _taskStore: TaskStore,
    private readonly _rules: WorkflowRules,
    private readonly _transitions: TaskStatusTransitions,
    private readonly _git: GitPort,
  ) {}

  async execute(_input: TasksPromoteToTodoInput): Promise<TasksPromoteToTodoResponse> {
    if (!isValidProjectName(_input.project)) {
      return {
        ok: false,
        error: {
          code: "INVALID_PROJECT_NAME",
          message: "Invalid project name.",
        },
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

    if (task.status !== "backlog") {
      return {
        ok: false,
        error: {
          code: "INVALID_STATUS_TRANSITION",
          message: "Invalid status transition.",
        },
      };
    }

    try {
      this._rules.assertTransition(task, "todo");
    } catch (error) {
      const code =
        error instanceof Error
          ? (error as unknown as { code?: string }).code
          : undefined;

      if (code === "INVALID_STATUS_TRANSITION") {
        return {
          ok: false,
          error: { code, message: "Invalid status transition." },
        };
      }

      return {
        ok: false,
        error: {
          code: "GIT_OPERATION_FAILED",
          message: "Failed to validate workflow rules.",
        },
      };
    }

    const updated = this._transitions.toTodo(task);

    try {
      await this._taskStore.write(updated);
      await this._git.commitAll(`promote_to_todo ${updated.id}`);
    } catch {
      return {
        ok: false,
        error: { code: "IO_ERROR", message: "Failed to promote task." },
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
