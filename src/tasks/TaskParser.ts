import type { TaskEntity } from "./TaskStore.js";

function yamlString(value: string): string {
  const escaped = value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return `"${escaped}"`;
}

export function parseTask(markdown: string): TaskEntity {
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
  const started_at = header["started_at"];
  const done_at = header["done_at"];
  const canceled_at = header["canceled_at"];
  const toolRaw = header["tool"];

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

  let tool: string | undefined;
  if (typeof toolRaw === "string") {
    try {
      const parsed = JSON.parse(toolRaw);
      if (typeof parsed !== "string") {
        const error = new Error("Invalid task format.");
        (error as unknown as { code: string }).code = "INVALID_TASK_FORMAT";
        throw error;
      }
      tool = parsed;
    } catch (error) {
      const code =
        error instanceof Error
          ? (error as unknown as { code?: string }).code
          : undefined;
      if (code === "INVALID_TASK_FORMAT") {
        throw error;
      }

      const invalid = new Error("Invalid task format.");
      (invalid as unknown as { code: string }).code = "INVALID_TASK_FORMAT";
      throw invalid;
    }
  }

  return {
    id,
    project,
    type,
    title,
    status: status as TaskEntity["status"],
    created_at,
    started_at,
    done_at,
    canceled_at,
    tool,
    body: body === "" ? undefined : body,
  };
}

export function serializeTask(task: TaskEntity): string {
  const lines: string[] = [];
  lines.push("---");
  lines.push(`id: ${task.id}`);
  lines.push(`project: ${task.project}`);
  lines.push(`type: ${task.type}`);
  lines.push(`title: ${yamlString(task.title)}`);
  lines.push(`status: ${task.status}`);
  lines.push(`created_at: ${task.created_at}`);
  if (task.started_at) lines.push(`started_at: ${task.started_at}`);
  if (task.done_at) lines.push(`done_at: ${task.done_at}`);
  if (task.canceled_at) lines.push(`canceled_at: ${task.canceled_at}`);
  if (task.tool) lines.push(`tool: ${yamlString(task.tool)}`);
  lines.push("---");

  const body = task.body ? `${task.body.trimEnd()}\n` : "";
  return `${lines.join("\n")}\n${body}`;
}

