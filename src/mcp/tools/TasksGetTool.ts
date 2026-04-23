import type { TaskStore, TaskEntity } from "../../tasks/TaskStore.js";
import type { TaskType } from "../../tasks/TaskType.js";
import { TaskValidator } from "../../tasks/TaskValidator.js";
import { isValidTaskId } from "../../tasks/TaskId.js";
import { stat } from "node:fs/promises";
import path from "node:path";

export type TasksGetInput = {
  project: string;
  id: string;
};

export type TaskDetails = {
  id: string;
  project: string;
  type: TaskType;
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

    const projectExists = await existsAsDirectory(this._store, _input.project);
    if (!projectExists) {
      return { ok: false, error: { code: "PROJECT_NOT_FOUND", message: "Project not found." } };
    }

    let task: TaskEntity;
    try {
      task = await this._store.read(_input.project, _input.id);
    } catch (error) {
      const code =
        error instanceof Error
          ? (error as unknown as { code?: string }).code
          : undefined;

      if (code === "TASK_NOT_FOUND") {
        return { ok: false, error: { code, message: "Task not found." } };
      }
      if (code === "INVALID_TASK_FORMAT") {
        return { ok: false, error: { code, message: "Invalid task format." } };
      }
      if (code === "IO_ERROR") {
        return { ok: false, error: { code, message: "Failed to read task." } };
      }

      return { ok: false, error: { code: "IO_ERROR", message: "Failed to read task." } };
    }

    const violations = new TaskValidator().validate(task, _input.id);
    if (violations.length > 0) {
      return { ok: false, error: { code: "INVALID_TASK_FORMAT", message: "Invalid task format." } };
    }

    return { ok: true, data: toTaskDetails(task) };
  }
}

export function toTaskDetails(_task: TaskEntity): TaskDetails {
  const details: TaskDetails = {
    id: _task.id,
    project: _task.project,
    type: _task.type,
    title: _task.title,
    status: _task.status,
    created_at: _task.created_at,
  };

  if (typeof _task.started_at === "string") details.started_at = _task.started_at;
  if (typeof _task.done_at === "string") details.done_at = _task.done_at;
  if (typeof _task.canceled_at === "string") details.canceled_at = _task.canceled_at;
  if (typeof _task.tool === "string") details.tool = _task.tool;
  if (typeof _task.body === "string") details.body = _task.body;

  return details;
}

function isValidProjectName(name: string): boolean {
  return /^[a-z0-9-]+$/.test(name);
}

async function existsAsDirectory(store: TaskStore, project: string): Promise<boolean> {
  const projectDir = path.dirname(store.taskPath(project, "__probe__"));
  try {
    const info = await stat(projectDir);
    return info.isDirectory();
  } catch {
    return false;
  }
}
