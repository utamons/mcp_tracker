import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readdir, readFile } from "node:fs/promises";

const DEFAULT_REPO_ROOT = path.join(os.homedir(), ".mcp_tracker", "projects");
const TASK_TEMPLATE_SUFFIX = "_TEMPLATE.md";
const STATUSES = ["backlog", "todo", "in_progress"];
const TASK_ID_REGEX = /^[A-Z]{2}-\d{3,}$/;

function invalidTaskFormat() {
  const error = new Error("Invalid task format.");
  error.code = "INVALID_TASK_FORMAT";
  return error;
}

function isValidProjectName(name) {
  return /^[a-z0-9-]+$/.test(name);
}

function isTaskMarkdownFile(name) {
  return name.endsWith(".md") && !name.endsWith(TASK_TEMPLATE_SUFFIX);
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

  if (!id || !project || !type || !titleRaw || !status || !created_at) {
    throw invalidTaskFormat();
  }

  if (type !== "user_story" && type !== "bug") {
    throw invalidTaskFormat();
  }

  if (!STATUSES.includes(status) && status !== "done" && status !== "canceled") {
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

  return { id, project, type, title, status };
}

async function listTasks(repoRoot, project) {
  const projectDir = path.join(repoRoot, project);
  let entries;
  try {
    entries = await readdir(projectDir, { withFileTypes: true });
  } catch (error) {
    const code = error?.code;
    if (code === "ENOENT") {
      const notFound = new Error("Project not found.");
      notFound.code = "PROJECT_NOT_FOUND";
      throw notFound;
    }

    const io = new Error("Failed to list tasks.");
    io.code = "IO_ERROR";
    throw io;
  }

  const files = entries
    .filter((entry) => entry.isFile() && isTaskMarkdownFile(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const tasks = [];
  for (const fileName of files) {
    const expectedId = fileName.slice(0, -".md".length);
    if (!TASK_ID_REGEX.test(expectedId)) {
      throw invalidTaskFormat();
    }

    let content;
    try {
      content = await readFile(path.join(projectDir, fileName), "utf8");
    } catch {
      const io = new Error("Failed to read task.");
      io.code = "IO_ERROR";
      throw io;
    }

    const task = parseTask(content);
    if (task.project !== project || task.id !== expectedId) {
      throw invalidTaskFormat();
    }
    if (!TASK_ID_REGEX.test(task.id)) {
      throw invalidTaskFormat();
    }

    tasks.push(task);
  }

  return tasks;
}

function mapError(error) {
  const code = error?.code;
  switch (code) {
    case "PROJECT_NOT_FOUND":
      return { code: "PROJECT_NOT_FOUND", message: "Project not found." };
    case "INVALID_TASK_FORMAT":
      return { code: "INVALID_TASK_FORMAT", message: "Invalid task format." };
    case "IO_ERROR":
      return { code: "IO_ERROR", message: "Failed to list tasks." };
    default:
      return { code: "IO_ERROR", message: "Failed to list tasks." };
  }
}

function formatTasks(tasks) {
  const lines = [];
  for (const status of STATUSES) {
    lines.push(`${status}:`);
    for (const task of tasks) {
      if (task.status !== status) continue;
      lines.push(`${task.id} \u2014 ${task.title}`);
    }
  }
  return lines.join("\n");
}

export async function buildTasksList({ project, repoRoot } = {}) {
  if (!project || typeof project !== "string") {
    return {
      ok: false,
      error: { code: "INVALID_PROJECT_NAME", message: "Invalid project name." },
    };
  }

  if (!isValidProjectName(project)) {
    return {
      ok: false,
      error: { code: "INVALID_PROJECT_NAME", message: "Invalid project name." },
    };
  }

  const resolvedRoot = repoRoot ?? DEFAULT_REPO_ROOT;

  try {
    const tasks = await listTasks(resolvedRoot, project);
    return { ok: true, output: formatTasks(tasks) };
  } catch (error) {
    return { ok: false, error: mapError(error) };
  }
}

async function runCli() {
  const args = process.argv.slice(2);
  const projectIndex = args.indexOf("--project");
  const project = projectIndex >= 0 ? args[projectIndex + 1] : undefined;

  if (!project) {
    console.error("Missing required --project <name> argument.");
    process.exitCode = 1;
    return;
  }

  const result = await buildTasksList({ project });
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
