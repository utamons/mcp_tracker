import type { TaskStore, TaskEntity } from "../../tasks/TaskStore.js";

export type TasksGetInput = {
  project: string;
  id: string;
};

export type TaskDetails = {
  id: string;
  project: string;
  type: "user_story" | "bug";
  title: string;
  status: "backlog" | "todo" | "in_progress" | "done" | "canceled";
  created_at: string;
  started_at?: string;
  done_at?: string;
  canceled_at?: string;
  tool?: string;
  body?: string;
};

export type TasksGetResponse =
  | { ok: true; data: TaskDetails }
  | { ok: false; error: { code: string; message: string; details?: object } };

export class TasksGetTool {
  constructor(private readonly _store: TaskStore) {}

  async execute(_input: TasksGetInput): Promise<TasksGetResponse> {
    void _input;
    return {
      ok: false,
      error: { code: "NOT_IMPLEMENTED", message: "Not implemented." },
    };
  }
}

export function toTaskDetails(_task: TaskEntity): TaskDetails {
  return {
    id: _task.id,
    project: _task.project,
    type: _task.type,
    title: _task.title,
    status: _task.status,
    created_at: _task.created_at,
    started_at: _task.started_at,
    done_at: _task.done_at,
    canceled_at: _task.canceled_at,
    tool: _task.tool,
    body: _task.body,
  };
}

