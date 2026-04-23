import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_REPO_ROOT = path.join(os.homedir(), ".mcp_tracker", "projects");
const TASK_TYPES = new Set(["user_story", "bug", "review"]);

function error(code, message) {
  return { ok: false, error: { code, message } };
}

function isValidProjectName(name) {
  return /^[a-z0-9-]+$/.test(name);
}

function parseFrontmatterValue(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed);
      return typeof parsed === "string" ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  return trimmed;
}

function invalidImportFormat() {
  return error("INVALID_IMPORT_FORMAT", "Invalid import file format.");
}

export function parseImportMarkdown(markdown) {
  const lines = markdown.split("\n");
  if (lines[0] !== "---") {
    return invalidImportFormat();
  }

  const header = {};
  let index = 1;
  for (; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === "---") break;
    if (line.trim() === "") continue;

    const match = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!match) {
      return invalidImportFormat();
    }

    const value = parseFrontmatterValue(match[2]);
    if (typeof value !== "string") {
      return invalidImportFormat();
    }
    header[match[1]] = value;
  }

  if (index >= lines.length || lines[index] !== "---") {
    return invalidImportFormat();
  }

  if (typeof header.title !== "string" || header.title.trim() === "") {
    return invalidImportFormat();
  }
  if (typeof header.type !== "string" || !TASK_TYPES.has(header.type)) {
    return invalidImportFormat();
  }

  return {
    ok: true,
    data: {
      title: header.title,
      type: header.type,
      body: lines.slice(index + 1).join("\n").trimEnd(),
    },
  };
}

function computePrefix(project) {
  const tokens = project.split(/[-_ ]+/).filter((token) => token.length > 0);
  if (tokens.length === 0) return "XX";
  if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase();
  return (tokens[0][0] + tokens[1][0]).toUpperCase();
}

async function nextTaskId(repoRoot, project) {
  const prefix = computePrefix(project);
  const projectDir = path.join(repoRoot, project);
  const entries = await readdir(projectDir, { withFileTypes: true });
  const pattern = new RegExp(`^${prefix}-(\\d{3,})\\.md$`);
  let max = 0n;

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = entry.name.match(pattern);
    if (!match) continue;
    const number = BigInt(match[1]);
    if (number > max) max = number;
  }

  const next = max + 1n;
  if (next > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw Object.assign(new Error("Task id overflow."), { code: "ID_OVERFLOW" });
  }

  const nextNumber = Number(next);
  const suffix =
    nextNumber <= 999 ? String(nextNumber).padStart(3, "0") : String(nextNumber);
  return `${prefix}-${suffix}`;
}

function nowIsoWithOffset() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absOffset = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(absOffset / 60)).padStart(2, "0");
  const offsetMins = String(absOffset % 60).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${sign}${offsetHours}:${offsetMins}`;
}

function serializeTask(task) {
  const lines = [
    "---",
    `id: ${task.id}`,
    `project: ${task.project}`,
    `type: ${task.type}`,
    `title: ${JSON.stringify(task.title)}`,
    `status: backlog`,
    `created_at: ${task.created_at}`,
    "---",
  ];
  const body = task.body ? `${task.body.trimEnd()}\n` : "";
  return `${lines.join("\n")}\n${body}`;
}

async function assertCleanWorktree(repoRoot, ignoredFilePath) {
  const { stdout } = await execFileAsync("git", ["status", "--porcelain"], {
    cwd: repoRoot,
  });
  const ignoredRelativePath =
    typeof ignoredFilePath === "string" && path.isAbsolute(ignoredFilePath)
      ? path.relative(repoRoot, ignoredFilePath)
      : undefined;
  const dirtyLines = stdout
    .toString()
    .split("\n")
    .filter((line) => line.trim() !== "")
    .filter((line) => {
      if (!ignoredRelativePath || ignoredRelativePath.startsWith("..")) return true;
      return line.slice(3).trim() !== ignoredRelativePath;
    });

  if (dirtyLines.length > 0) {
    throw Object.assign(new Error("Git worktree is dirty."), {
      code: "GIT_DIRTY_WORKTREE",
    });
  }
}

async function commitFile(repoRoot, filePath, message) {
  const relativePath = path.relative(repoRoot, filePath);
  await execFileAsync("git", ["add", "--", relativePath], { cwd: repoRoot });
  await execFileAsync("git", ["commit", "-m", message], { cwd: repoRoot });
}

function mapCreateError(cause) {
  switch (cause?.code) {
    case "ENOENT":
      return error("PROJECT_NOT_FOUND", "Project not found.");
    case "GIT_DIRTY_WORKTREE":
      return error("GIT_DIRTY_WORKTREE", cause.message);
    default:
      return error("IO_ERROR", "Failed to import task.");
  }
}

export async function buildTaskImport({ project, filePath, repoRoot } = {}) {
  if (!project || typeof project !== "string" || !filePath || typeof filePath !== "string") {
    return error("INVALID_ARGUMENTS", "Missing required project or file path.");
  }
  if (!isValidProjectName(project)) {
    return error("INVALID_PROJECT_NAME", "Invalid project name.");
  }

  const resolvedRoot = repoRoot ?? DEFAULT_REPO_ROOT;
  let markdown;
  try {
    markdown = await readFile(filePath, "utf8");
  } catch {
    return error("IO_ERROR", "Failed to read import file.");
  }

  const parsed = parseImportMarkdown(markdown);
  if (!parsed.ok) return parsed;

  const projectDir = path.join(resolvedRoot, project);
  try {
    const projectInfo = await stat(projectDir);
    if (!projectInfo.isDirectory()) {
      return error("PROJECT_NOT_FOUND", "Project not found.");
    }
  } catch (cause) {
    if (cause?.code === "ENOENT") {
      return error("PROJECT_NOT_FOUND", "Project not found.");
    }
    return error("IO_ERROR", "Failed to read project.");
  }

  let id;
  let taskPath;
  try {
    await assertCleanWorktree(resolvedRoot, filePath);
    await mkdir(projectDir, { recursive: true });
    id = await nextTaskId(resolvedRoot, project);
    taskPath = path.join(projectDir, `${id}.md`);

    await writeFile(
      taskPath,
      serializeTask({
        id,
        project,
        type: parsed.data.type,
        title: parsed.data.title,
        body: parsed.data.body,
        created_at: nowIsoWithOffset(),
      }),
      "utf8",
    );
    await commitFile(resolvedRoot, taskPath, `create ${id}`);
  } catch (cause) {
    if (taskPath) {
      try {
        await unlink(taskPath);
      } catch {
        // ignore cleanup errors
      }
    }
    return mapCreateError(cause);
  }

  return {
    ok: true,
    data: {
      id,
      project,
      type: parsed.data.type,
      title: parsed.data.title,
      status: "backlog",
    },
    output: id,
  };
}

async function runCli() {
  const args = process.argv.slice(2);
  const projectIndex = args.indexOf("--project");
  const fileIndex = args.indexOf("--file");
  const project = projectIndex >= 0 ? args[projectIndex + 1] : undefined;
  const filePath = fileIndex >= 0 ? args[fileIndex + 1] : args[0];

  if (!project || !filePath) {
    console.error("Missing required --project <name> and --file <path> arguments.");
    process.exitCode = 1;
    return;
  }

  const result = await buildTaskImport({ project, filePath });
  if (!result.ok) {
    console.error(result.error.message);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`${result.output}\n`);
}

const entryPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === entryPath) {
  runCli();
}
