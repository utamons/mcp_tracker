import type { TaskQueryService, TaskView } from "../../tasks/TaskQueryService.js";

export type TasksListInput = {
  project: string;
  status?: "backlog" | "todo" | "in_progress" | "done" | "canceled";
  text?: string;
};

export type TasksListResponse =
  | { ok: true; data: { tasks: TaskView[] } }
  | { ok: false; error: { code: string; message: string; details?: object } };

export class TasksListTool {
  constructor(private readonly _query: TaskQueryService) {}

  async execute(_input: TasksListInput): Promise<TasksListResponse> {
    void this._query;
    void _input;
    return {
      ok: false,
      error: { code: "NOT_IMPLEMENTED", message: "Not implemented." },
    };
  }
}

