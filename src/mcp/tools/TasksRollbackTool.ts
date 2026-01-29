import type { RollbackService, TaskView } from "../../git/RollbackService.js";
import { isValidTaskId } from "../../tasks/TaskId.js";

export type TasksRollbackInput = {
  project: string;
  id: string;
  revision: string;
};

export type TasksRollbackResponse =
  | { ok: true; data: TaskView }
  | { ok: false; error: { code: string; message: string; details?: object } };

export class TasksRollbackTool {
  constructor(private readonly _service: RollbackService) {}

  async execute(_input: TasksRollbackInput): Promise<TasksRollbackResponse> {
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
    if (typeof _input.revision !== "string" || _input.revision.trim() === "") {
      return {
        ok: false,
        error: { code: "INVALID_TASK_FORMAT", message: "Invalid revision." },
      };
    }

    try {
      const task = await this._service.rollbackTask(
        _input.project,
        _input.id,
        _input.revision,
      );
      return { ok: true, data: task };
    } catch (error) {
      const code =
        error instanceof Error
          ? (error as unknown as { code?: string }).code
          : undefined;

      if (code === "GIT_DIRTY_WORKTREE") {
        return { ok: false, error: { code, message: "Git worktree is dirty." } };
      }
      if (code === "PROJECT_NOT_FOUND") {
        return { ok: false, error: { code, message: "Project not found." } };
      }
      if (code === "TASK_NOT_FOUND") {
        return { ok: false, error: { code, message: "Task not found." } };
      }
      if (code === "INVALID_TASK_FORMAT") {
        return { ok: false, error: { code, message: "Invalid task format." } };
      }
      if (code === "GIT_OPERATION_FAILED") {
        return { ok: false, error: { code, message: "Git operation failed." } };
      }

      return {
        ok: false,
        error: { code: "GIT_OPERATION_FAILED", message: "Git operation failed." },
      };
    }
  }
}

function isValidProjectName(name: string): boolean {
  return /^[a-z0-9-]+$/.test(name);
}
