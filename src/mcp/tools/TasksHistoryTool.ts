import type { GitCommit } from "../../git/GitPort.js";
import type { HistoryService } from "../../git/HistoryService.js";
import { isValidTaskId } from "../../tasks/TaskId.js";

export type TasksHistoryInput = {
  project: string;
  id: string;
};

export type TasksHistoryResponse =
  | { ok: true; data: { commits: GitCommit[] } }
  | { ok: false; error: { code: string; message: string; details?: object } };

export class TasksHistoryTool {
  constructor(private readonly _service: HistoryService) {}

  async execute(_input: TasksHistoryInput): Promise<TasksHistoryResponse> {
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

    try {
      const commits = await this._service.getTaskHistory(_input.project, _input.id);
      return { ok: true, data: { commits } };
    } catch (error) {
      const code =
        error instanceof Error
          ? (error as unknown as { code?: string }).code
          : undefined;

      if (code === "PROJECT_NOT_FOUND") {
        return { ok: false, error: { code, message: "Project not found." } };
      }
      if (code === "TASK_NOT_FOUND") {
        return { ok: false, error: { code, message: "Task not found." } };
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
