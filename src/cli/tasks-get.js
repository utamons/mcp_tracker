import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

const DEFAULT_REPO_ROOT = path.join(os.homedir(), ".mcp_tracker", "projects");
const TASK_ID_REGEX = /^[A-Z]{2}-\d{3,}$/;
const STATUS_SET = new Set([
  "backlog",
  "todo",
  "in_progress",
  "done",
  "canceled",
]);

function invalidTaskFormat() {
  const error = new Error("Invalid task format.");
  error.code = "INVALID_TASK_FORMAT";
  return error;
}

function isValidProjectName(name) {
  return /^[a-z0-9-]+$/.test(name);
}

function isValidTaskId(id) {
  return typeof id === "string" && TASK_ID_REGEX.test(id);
}

function parseTask(markdown) {
  const lines = markdown.split("\n");
  if (lines[0] !== "---") {
    throw invalidTaskFormat();
  }

  const header = {};
  let index = 1;
  for (; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === "---") break;
    if (line.trim() === "") continue;

    const match = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!match) {
      throw invalidTaskFormat();
    }

    header[match[1]] = match[2];
  }

  if (index >= lines.length || lines[index] !== "---") {
    throw invalidTaskFormat();
  }

  const id = header.id;
  const project = header.project;
  const type = header.type;
  const titleRaw = header.title;
  const status = header.status;
  const created_at = header.created_at;
  const started_at = header.started_at;
  const done_at = header.done_at;
  const canceled_at = header.canceled_at;
  const toolRaw = header.tool;

  if (!id || !project || !type || !titleRaw || !status || !created_at) {
    throw invalidTaskFormat();
  }

  if (type !== "user_story" && type !== "bug") {
    throw invalidTaskFormat();
  }

  if (!STATUS_SET.has(status)) {
    throw invalidTaskFormat();
  }

  let title;
  try {
    title = JSON.parse(titleRaw);
  } catch {
    throw invalidTaskFormat();
  }

  if (typeof title !== "string") {
    throw invalidTaskFormat();
  }

  let tool;
  if (typeof toolRaw === "string") {
    try {
      const parsed = JSON.parse(toolRaw);
      if (typeof parsed !== "string") {
        throw invalidTaskFormat();
      }
      tool = parsed;
    } catch (error) {
      if (error?.code === "INVALID_TASK_FORMAT") {
        throw error;
      }
      throw invalidTaskFormat();
    }
  }

  const body = lines.slice(index + 1).join("\n").trimEnd();

  return {
    id,
    project,
    type,
    title,
    status,
    created_at,
    started_at,
    done_at,
    canceled_at,
    tool,
    body: body === "" ? undefined : body,
  };
}

async function readTask(repoRoot, project, id) {
  const filePath = path.join(repoRoot, project, `${id}.md`);
  let content;
  try {
    content = await readFile(filePath, "utf8");
  } catch (error) {
    const code = error?.code;
    if (code === "ENOENT") {
      const notFound = new Error("Task not found.");
      notFound.code = "TASK_NOT_FOUND";
      throw notFound;
    }

    const io = new Error("Failed to read task.");
    io.code = "IO_ERROR";
    throw io;
  }

  const task = parseTask(content);
  if (!isValidTaskId(task.id) || task.id !== id) {
    throw invalidTaskFormat();
  }
  if (task.project !== project) {
    throw invalidTaskFormat();
  }

  return task;
}

function mapError(error) {
  const code = error?.code;
  switch (code) {
    case "TASK_NOT_FOUND":
      return { code: "TASK_NOT_FOUND", message: "Task not found." };
    case "INVALID_TASK_FORMAT":
      return { code: "INVALID_TASK_FORMAT", message: "Invalid task format." };
    case "IO_ERROR":
      return { code: "IO_ERROR", message: "Failed to read task." };
    default:
      return { code: "IO_ERROR", message: "Failed to read task." };
  }
}

function formatTask(task) {
  const lines = [
    `id: ${task.id}`,
    `project: ${task.project}`,
    `type: ${task.type}`,
    `title: ${task.title}`,
    `status: ${task.status}`,
    `created_at: ${task.created_at}`,
  ];

  if (task.started_at) lines.push(`started_at: ${task.started_at}`);
  if (task.done_at) lines.push(`done_at: ${task.done_at}`);
  if (task.canceled_at) lines.push(`canceled_at: ${task.canceled_at}`);
  if (task.tool) lines.push(`tool: ${task.tool}`);

  if (task.body) {
    lines.push("", task.body);
  }

  return lines.join("\n");
}

export async function buildTaskDetails({ project, id, repoRoot } = {}) {
  if (!project || typeof project !== "string" || !isValidProjectName(project)) {
    return {
      ok: false,
      error: { code: "INVALID_PROJECT_NAME", message: "Invalid project name." },
    };
  }

  if (!id || typeof id !== "string" || !isValidTaskId(id)) {
    return {
      ok: false,
      error: { code: "INVALID_TASK_ID", message: "Invalid task id." },
    };
  }

  const resolvedRoot = repoRoot ?? DEFAULT_REPO_ROOT;

  try {
    const task = await readTask(resolvedRoot, project, id);
    return { ok: true, output: formatTask(task) };
  } catch (error) {
    return { ok: false, error: mapError(error) };
  }
}

async function runCli() {
  const args = process.argv.slice(2);
  const projectIndex = args.indexOf("--project");
  const idIndex = args.indexOf("--id");
  const project = projectIndex >= 0 ? args[projectIndex + 1] : undefined;
  const id = idIndex >= 0 ? args[idIndex + 1] : undefined;

  if (!project || !id) {
    console.error("Missing required --project <name> and --id <ID> arguments.");
    process.exitCode = 1;
    return;
  }

  const result = await buildTaskDetails({ project, id });
  if (!result.ok) {
    console.error(result.error.message);
    process.exitCode = 1;
    return;
  }

  const output = result.output.endsWith("\n")
    ? result.output
    : `${result.output}\n`;
  process.stdout.write(output);
}

const entryPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === entryPath) {
  runCli();
}
