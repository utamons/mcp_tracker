import type { Config } from "../config/Config.js";
import { writeFile } from "node:fs/promises";
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

  async write(_task: TaskEntity): Promise<void> {
    const content = serializeTask(_task);
    await writeFile(this.taskPath(_task.project, _task.id), content, "utf8");
  }
}

function yamlString(value: string): string {
  const escaped = value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return `"${escaped}"`;
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
