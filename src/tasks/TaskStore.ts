import type { Config } from "../config/Config.js";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type TaskEntity = {
  id: string;
  project: string;
  type: "user_story" | "bug";
  title: string;
  status: "backlog" | "todo" | "in_progress" | "done" | "canceled";
  created_at: string;
  body?: string;
};

export class TaskStore {
  constructor(private readonly _config: Config) {}

  taskPath(_project: string, _id: string): string {
    return path.join(this._config.getRepoRoot(), _project, `${_id}.md`);
  }

  async read(_project: string, _id: string): Promise<TaskEntity> {
    const filePath = this.taskPath(_project, _id);
    let content: string;
    try {
      content = await readFile(filePath, "utf8");
    } catch (error) {
      const code =
        error instanceof Error
          ? (error as unknown as { code?: string }).code
          : undefined;

      if (code === "ENOENT") {
        const notFound = new Error("Task not found.");
        (notFound as unknown as { code: string }).code = "TASK_NOT_FOUND";
        throw notFound;
      }

      const io = new Error("Failed to read task.");
      (io as unknown as { code: string }).code = "IO_ERROR";
      throw io;
    }

    const task = parseTask(content);
    if (task.project !== _project || task.id !== _id) {
      const invalid = new Error("Invalid task format.");
      (invalid as unknown as { code: string }).code = "INVALID_TASK_FORMAT";
      throw invalid;
    }

    return task;
  }

  async write(_task: TaskEntity): Promise<void> {
    const content = serializeTask(_task);
    await writeFile(this.taskPath(_task.project, _task.id), content, "utf8");
  }

  async list(_project: string): Promise<TaskEntity[]> {
    void _project;
    return [];
  }
}

function yamlString(value: string): string {
  const escaped = value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return `"${escaped}"`;
}

function parseTask(markdown: string): TaskEntity {
  const lines = markdown.split("\n");
  if (lines[0] !== "---") {
    const error = new Error("Invalid task format.");
    (error as unknown as { code: string }).code = "INVALID_TASK_FORMAT";
    throw error;
  }

  const header: Record<string, string> = {};
  let index = 1;
  for (; index < lines.length; index++) {
    const line = lines[index];
    if (line === "---") break;
    if (line.trim() === "") continue;

    const match = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!match) {
      const error = new Error("Invalid task format.");
      (error as unknown as { code: string }).code = "INVALID_TASK_FORMAT";
      throw error;
    }

    header[match[1]] = match[2];
  }

  if (index >= lines.length || lines[index] !== "---") {
    const error = new Error("Invalid task format.");
    (error as unknown as { code: string }).code = "INVALID_TASK_FORMAT";
    throw error;
  }

  const id = header["id"];
  const project = header["project"];
  const type = header["type"];
  const titleRaw = header["title"];
  const status = header["status"];
  const created_at = header["created_at"];

  if (!id || !project || !type || !titleRaw || !status || !created_at) {
    const error = new Error("Invalid task format.");
    (error as unknown as { code: string }).code = "INVALID_TASK_FORMAT";
    throw error;
  }

  if (type !== "user_story" && type !== "bug") {
    const error = new Error("Invalid task format.");
    (error as unknown as { code: string }).code = "INVALID_TASK_FORMAT";
    throw error;
  }

  const allowedStatuses: TaskEntity["status"][] = [
    "backlog",
    "todo",
    "in_progress",
    "done",
    "canceled",
  ];
  if (!allowedStatuses.includes(status as TaskEntity["status"])) {
    const error = new Error("Invalid task format.");
    (error as unknown as { code: string }).code = "INVALID_TASK_FORMAT";
    throw error;
  }

  let title: string;
  try {
    title = JSON.parse(titleRaw);
  } catch {
    const error = new Error("Invalid task format.");
    (error as unknown as { code: string }).code = "INVALID_TASK_FORMAT";
    throw error;
  }

  const body = lines.slice(index + 1).join("\n").trimEnd();

  return {
    id,
    project,
    type,
    title,
    status: status as TaskEntity["status"],
    created_at,
    body: body === "" ? undefined : body,
  };
}

function serializeTask(task: TaskEntity): string {
  const lines: string[] = [];
  lines.push("---");
  lines.push(`id: ${task.id}`);
  lines.push(`project: ${task.project}`);
  lines.push(`type: ${task.type}`);
  lines.push(`title: ${yamlString(task.title)}`);
  lines.push(`status: ${task.status}`);
  lines.push(`created_at: ${task.created_at}`);
  lines.push("---");

  const body = task.body ? `${task.body.trimEnd()}\n` : "";
  return `${lines.join("\n")}\n${body}`;
}
