import type { TaskQueryService, TaskView } from "../../tasks/TaskQueryService.js";

export type TasksListInput = {
  project: string;
  status?: "backlog" | "todo" | "in_progress" | "done" | "canceled";
  type?: "user_story" | "bug";
  text?: string;
};

export type TasksListResponse =
  | { ok: true; data: { tasks: TaskView[] } }
  | { ok: false; error: { code: string; message: string; details?: object } };

export class TasksListTool {
  constructor(private readonly _query: TaskQueryService) {}

  async execute(_input: TasksListInput): Promise<TasksListResponse> {
    if (!isValidProjectName(_input.project)) {
      return {
        ok: false,
        error: { code: "INVALID_PROJECT_NAME", message: "Invalid project name." },
      };
    }

    if (_input.status && !isValidStatus(_input.status)) {
      return {
        ok: false,
        error: { code: "INVALID_TASK_FORMAT", message: "Invalid task status." },
      };
    }

    if (_input.type && !isValidType(_input.type)) {
      return {
        ok: false,
        error: { code: "INVALID_TASK_FORMAT", message: "Invalid task type." },
      };
    }

    if (typeof _input.text !== "undefined" && typeof _input.text !== "string") {
      return {
        ok: false,
        error: { code: "INVALID_TASK_FORMAT", message: "Invalid text filter." },
      };
    }

    try {
      const tasks = await this._query.list(_input.project, {
        status: _input.status,
        type: _input.type,
        text: _input.text,
      });
      return { ok: true, data: { tasks } };
    } catch (error) {
      const code =
        error instanceof Error
          ? (error as unknown as { code?: string }).code
          : undefined;

      if (code === "PROJECT_NOT_FOUND") {
        return { ok: false, error: { code, message: "Project not found." } };
      }
      if (code === "INVALID_TASK_FORMAT") {
        return { ok: false, error: { code, message: "Invalid task format." } };
      }
      if (code === "IO_ERROR") {
        return { ok: false, error: { code, message: "Failed to list tasks." } };
      }

      return {
        ok: false,
        error: { code: "IO_ERROR", message: "Failed to list tasks." },
      };
    }
  }
}

function isValidProjectName(name: string): boolean {
  return /^[a-z0-9-]+$/.test(name);
}

function isValidStatus(
  status: TasksListInput["status"],
): status is NonNullable<TasksListInput["status"]> {
  return (
    status === "backlog" ||
    status === "todo" ||
    status === "in_progress" ||
    status === "done" ||
    status === "canceled"
  );
}

function isValidType(
  type: TasksListInput["type"],
): type is NonNullable<TasksListInput["type"]> {
  return type === "user_story" || type === "bug";
}
