import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const server = new McpServer({
  name: "mcp-tracker",
  version: "0.1.0",
});

const emptyInputSchema = z.object({}).strict();

function notImplementedResult() {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          ok: false,
          error: { code: "NOT_IMPLEMENTED", message: "Not implemented." },
        }),
      },
    ],
  };
}

function toMcpTextResult(payload) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload),
      },
    ],
  };
}

const defaultRepoRoot = path.join(os.homedir(), ".mcp_tracker", "projects");

function isValidProjectName(name) {
  return /^[a-z0-9-]+$/.test(name);
}

function isValidTaskId(id) {
  return typeof id === "string" && /^[A-Z]{2}-\d{3,}$/.test(id);
}

const TASK_TEMPLATE_SUFFIX = "_TEMPLATE.md";
const TASK_TYPES = ["user_story", "bug", "review"];
const TASK_TYPE_SET = new Set(TASK_TYPES);

function isTaskMarkdownFile(name) {
  return name.endsWith(".md") && !name.endsWith(TASK_TEMPLATE_SUFFIX);
}

function isValidTemplateType(type) {
  return typeof type === "string" && /^[a-z0-9_-]+$/.test(type);
}

function templateFileName(type) {
  return `${type.toUpperCase()}${TASK_TEMPLATE_SUFFIX}`;
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

function computePrefix(project) {
  const tokens = project.split(/[-_ ]+/).filter((token) => token.length > 0);
  if (tokens.length === 0) return "XX";
  if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase();
  return (tokens[0][0] + tokens[1][0]).toUpperCase();
}

async function assertCleanWorktree(repoRoot) {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["status", "--porcelain"],
      { cwd: repoRoot },
    );
    if (stdout.toString().trim() === "") return null;
    return { code: "GIT_DIRTY_WORKTREE", message: "Git worktree is dirty." };
  } catch {
    return { code: "GIT_REPO_NOT_FOUND", message: "Git repository not found." };
  }
}

async function commitAll(repoRoot, message) {
  await execFileAsync("git", ["add", "-A"], { cwd: repoRoot });
  await execFileAsync("git", ["commit", "-m", message], { cwd: repoRoot });
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
    const num = BigInt(match[1]);
    if (num > max) max = num;
  }

  const next = max + 1n;
  if (next > BigInt(Number.MAX_SAFE_INTEGER)) {
    return null;
  }

  const nextNumber = Number(next);
  const suffix =
    nextNumber <= 999 ? String(nextNumber).padStart(3, "0") : String(nextNumber);
  return `${prefix}-${suffix}`;
}

function serializeTaskMarkdown(task) {
  const {
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
    body,
  } = task;

  const safeTitle = JSON.stringify(String(title));
  const lines = [
    "---",
    `id: ${id}`,
    `project: ${project}`,
    `type: ${type}`,
    `title: ${safeTitle}`,
    `status: ${status}`,
    `created_at: ${created_at}`,
  ];

  if (typeof started_at === "string") lines.push(`started_at: ${started_at}`);
  if (typeof done_at === "string") lines.push(`done_at: ${done_at}`);
  if (typeof canceled_at === "string") lines.push(`canceled_at: ${canceled_at}`);
  if (typeof tool === "string") lines.push(`tool: ${JSON.stringify(String(tool))}`);

  lines.push("---");

  const normalizedBody = body ? `${String(body).trimEnd()}\n` : "";
  return `${lines.join("\n")}\n${normalizedBody}`;
}

async function listProjects(repoRoot) {
  const entries = await readdir(repoRoot, { withFileTypes: true });
  const projects = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "tasks") continue;

    if (isValidProjectName(entry.name)) {
      projects.push(entry.name);
      continue;
    }

    console.warn("Ignoring invalid project name.", { name: entry.name });
  }

  projects.sort((left, right) => left.localeCompare(right));
  return projects;
}

async function executeProjectsList() {
  try {
    const projects = await listProjects(defaultRepoRoot);
    return { ok: true, data: { projects } };
  } catch {
    return {
      ok: false,
      error: { code: "IO_ERROR", message: "Failed to read repo root." },
    };
  }
}

async function executeTaskTemplate(input) {
  const project = input?.project;
  const type = input?.type;

  if (typeof project !== "string" || !isValidProjectName(project)) {
    return {
      ok: false,
      error: { code: "INVALID_PROJECT_NAME", message: "Invalid project name." },
    };
  }
  if (!isValidTemplateType(type)) {
    return {
      ok: false,
      error: { code: "INVALID_TEMPLATE_TYPE", message: "Invalid template type." },
    };
  }

  const projectDir = path.join(defaultRepoRoot, project);
  try {
    const info = await stat(projectDir);
    if (!info.isDirectory()) {
      return {
        ok: false,
        error: { code: "PROJECT_NOT_FOUND", message: "Project not found." },
      };
    }
  } catch (error) {
    const code =
      error instanceof Error ? error.code : undefined;

    if (code === "ENOENT") {
      return {
        ok: false,
        error: { code: "PROJECT_NOT_FOUND", message: "Project not found." },
      };
    }

    return {
      ok: false,
      error: { code: "IO_ERROR", message: "Failed to read task template." },
    };
  }

  const templatePath = path.join(projectDir, templateFileName(type));
  try {
    const template = await readFile(templatePath, "utf8");
    return { ok: true, data: { template } };
  } catch (error) {
    const code =
      error instanceof Error ? error.code : undefined;

    if (code === "ENOENT") {
      return {
        ok: false,
        error: {
          code: "TASK_TEMPLATE_NOT_FOUND",
          message: "Task template not found.",
        },
      };
    }

    return {
      ok: false,
      error: { code: "IO_ERROR", message: "Failed to read task template." },
    };
  }
}

async function executeTasksCreate(input) {
  const project = input?.project;
  const type = input?.type;
  const title = input?.title;
  const body = input?.body;

  if (typeof project !== "string" || !isValidProjectName(project)) {
    return {
      ok: false,
      error: { code: "INVALID_PROJECT_NAME", message: "Invalid project name." },
    };
  }
  if (!TASK_TYPE_SET.has(type)) {
    return {
      ok: false,
      error: { code: "INVALID_TASK_FORMAT", message: "Invalid task type." },
    };
  }
  if (typeof title !== "string" || title.trim() === "") {
    return {
      ok: false,
      error: { code: "INVALID_TASK_FORMAT", message: "Invalid task title." },
    };
  }

  const projectDir = path.join(defaultRepoRoot, project);
  try {
    const entries = await readdir(projectDir, { withFileTypes: true });
    if (!entries) {
      // unreachable, keeps flow explicit
    }
  } catch {
    return {
      ok: false,
      error: { code: "PROJECT_NOT_FOUND", message: "Project not found." },
    };
  }

  const worktreeError = await assertCleanWorktree(defaultRepoRoot);
  if (worktreeError) {
    return { ok: false, error: worktreeError };
  }

  const id = await nextTaskId(defaultRepoRoot, project);
  if (!id) {
    return {
      ok: false,
      error: { code: "IO_ERROR", message: "Failed to allocate task id." },
    };
  }

  const created_at = nowIsoWithOffset();
  const status = "backlog";

  const taskPath = path.join(defaultRepoRoot, project, `${id}.md`);
  const content = serializeTaskMarkdown({
    id,
    project,
    type,
    title,
    status,
    created_at,
    body,
  });

  try {
    await writeFile(taskPath, content, "utf8");
    await commitAll(defaultRepoRoot, `create ${id}`);
  } catch {
    await rm(taskPath, { force: true });
    return {
      ok: false,
      error: { code: "IO_ERROR", message: "Failed to create task." },
    };
  }

  return {
    ok: true,
    data: { id, project, type, title, status, created_at },
  };
}

function parseTaskMarkdown(content) {
  const lines = String(content).split("\n");
  if (lines[0] !== "---") {
    return null;
  }

  const header = {};
  let idx = 1;
  for (; idx < lines.length; idx++) {
    const line = lines[idx];
    if (line === "---") break;
    if (line.trim() === "") continue;

    const match = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!match) return null;

    header[match[1]] = match[2];
  }

  if (idx >= lines.length || lines[idx] !== "---") {
    return null;
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
    return null;
  }

  if (!isValidTaskId(id)) {
    return null;
  }

  if (!TASK_TYPE_SET.has(type)) {
    return null;
  }

  const allowedStatuses = ["backlog", "todo", "in_progress", "done", "canceled"];
  if (!allowedStatuses.includes(status)) {
    return null;
  }

  let title;
  try {
    title = JSON.parse(titleRaw);
  } catch {
    return null;
  }

  const body = lines.slice(idx + 1).join("\n").trimEnd();

  let tool;
  if (typeof toolRaw === "string") {
    try {
      const parsed = JSON.parse(toolRaw);
      if (typeof parsed !== "string") return null;
      tool = parsed;
    } catch {
      return null;
    }
  }

  return {
    id,
    project,
    type,
    title,
    status,
    created_at,
    started_at: typeof started_at === "string" ? started_at : undefined,
    done_at: typeof done_at === "string" ? done_at : undefined,
    canceled_at: typeof canceled_at === "string" ? canceled_at : undefined,
    tool,
    body: body === "" ? undefined : body,
  };
}

function taskMatchesText(task, text) {
  const query = String(text ?? "").trim();
  if (query === "") return true;

  const needle = query.toLowerCase();
  const title = String(task.title ?? "").toLowerCase();
  const body = String(task.body ?? "").toLowerCase();
  return title.includes(needle) || body.includes(needle);
}

async function executeTasksList(input) {
  const project = input?.project;
  const status = input?.status;
  const type = input?.type;
  const text = input?.text;

  if (typeof project !== "string" || !isValidProjectName(project)) {
    return {
      ok: false,
      error: { code: "INVALID_PROJECT_NAME", message: "Invalid project name." },
    };
  }

  const projectDir = path.join(defaultRepoRoot, project);
  let entries;
  try {
    entries = await readdir(projectDir, { withFileTypes: true });
  } catch {
    return {
      ok: false,
      error: { code: "PROJECT_NOT_FOUND", message: "Project not found." },
    };
  }

  const allowedStatuses = ["backlog", "todo", "in_progress", "done", "canceled"];
  if (typeof status !== "undefined" && !allowedStatuses.includes(status)) {
    return {
      ok: false,
      error: { code: "INVALID_TASK_FORMAT", message: "Invalid task status." },
    };
  }

  const allowedTypes = TASK_TYPES;
  if (typeof type !== "undefined" && !allowedTypes.includes(type)) {
    return {
      ok: false,
      error: { code: "INVALID_TASK_FORMAT", message: "Invalid task type." },
    };
  }

  if (typeof text !== "undefined" && typeof text !== "string") {
    return {
      ok: false,
      error: { code: "INVALID_TASK_FORMAT", message: "Invalid text filter." },
    };
  }

  const tasks = [];
  const files = entries
    .filter((entry) => entry.isFile() && isTaskMarkdownFile(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  for (const fileName of files) {
    const expectedId = fileName.slice(0, -".md".length);
    const taskPath = path.join(projectDir, fileName);

    let content;
    try {
      content = await readFile(taskPath, "utf8");
    } catch {
      return {
        ok: false,
        error: { code: "IO_ERROR", message: "Failed to read task." },
      };
    }

    const task = parseTaskMarkdown(content);
    if (!task || task.project !== project || task.id !== expectedId) {
      return {
        ok: false,
        error: { code: "INVALID_TASK_FORMAT", message: "Invalid task format." },
      };
    }

    if (status && task.status !== status) continue;
    if (type && task.type !== type) continue;
    if (!taskMatchesText(task, text)) continue;

    tasks.push({
      id: task.id,
      project: task.project,
      type: task.type,
      title: task.title,
      status: task.status,
      created_at: task.created_at,
    });
  }

  return { ok: true, data: { tasks } };
}

async function executeTasksUpdate(input) {
  const project = input?.project;
  const id = input?.id;
  const patch = input?.patch;

  if (typeof project !== "string" || !isValidProjectName(project)) {
    return {
      ok: false,
      error: { code: "INVALID_PROJECT_NAME", message: "Invalid project name." },
    };
  }
  if (!isValidTaskId(id)) {
    return {
      ok: false,
      error: { code: "INVALID_TASK_FORMAT", message: "Invalid task id." },
    };
  }
  if (typeof patch !== "object" || patch === null) {
    return {
      ok: false,
      error: { code: "INVALID_TASK_FORMAT", message: "Invalid patch format." },
    };
  }

  const projectDir = path.join(defaultRepoRoot, project);
  try {
    const entries = await readdir(projectDir, { withFileTypes: true });
    if (!entries) {
      // unreachable, keeps flow explicit
    }
  } catch {
    return {
      ok: false,
      error: { code: "PROJECT_NOT_FOUND", message: "Project not found." },
    };
  }

  const taskPath = path.join(defaultRepoRoot, project, `${id}.md`);
  let currentContent;
  try {
    currentContent = await readFile(taskPath, "utf8");
  } catch {
    return {
      ok: false,
      error: { code: "TASK_NOT_FOUND", message: "Task not found." },
    };
  }

  const task = parseTaskMarkdown(currentContent);
  if (!task || task.id !== id || task.project !== project) {
    return {
      ok: false,
      error: { code: "INVALID_TASK_FORMAT", message: "Invalid task format." },
    };
  }

  if (task.status !== "backlog") {
    return {
      ok: false,
      error: {
        code: "FORBIDDEN_UPDATE_IN_STATUS",
        message: "Update is forbidden in this status.",
      },
    };
  }

  const worktreeError = await assertCleanWorktree(defaultRepoRoot);
  if (worktreeError) {
    return { ok: false, error: worktreeError };
  }

  const next = { ...task };
  if (patch.type !== undefined) {
    if (!TASK_TYPE_SET.has(patch.type)) {
      return {
        ok: false,
        error: { code: "INVALID_TASK_FORMAT", message: "Invalid task type." },
      };
    }
    next.type = patch.type;
  }
  if (patch.title !== undefined) {
    if (typeof patch.title !== "string" || patch.title.trim() === "") {
      return {
        ok: false,
        error: { code: "INVALID_TASK_FORMAT", message: "Invalid task title." },
      };
    }
    next.title = patch.title;
  }
  if (patch.body !== undefined) {
    if (typeof patch.body !== "string") {
      return {
        ok: false,
        error: { code: "INVALID_TASK_FORMAT", message: "Invalid task body." },
      };
    }
    next.body = patch.body === "" ? undefined : patch.body;
  }

  const updatedContent = serializeTaskMarkdown(next);
  try {
    await writeFile(taskPath, updatedContent, "utf8");
    await commitAll(defaultRepoRoot, `update ${id}`);
  } catch {
    return {
      ok: false,
      error: { code: "IO_ERROR", message: "Failed to update task." },
    };
  }

  return {
    ok: true,
    data: {
      id: next.id,
      project: next.project,
      type: next.type,
      title: next.title,
      status: next.status,
      created_at: next.created_at,
    },
  };
}

async function executeTasksPromoteToTodo(input) {
  const project = input?.project;
  const id = input?.id;

  if (typeof project !== "string" || !isValidProjectName(project)) {
    return {
      ok: false,
      error: { code: "INVALID_PROJECT_NAME", message: "Invalid project name." },
    };
  }
  if (!isValidTaskId(id)) {
    return {
      ok: false,
      error: { code: "INVALID_TASK_FORMAT", message: "Invalid task id." },
    };
  }

  const projectDir = path.join(defaultRepoRoot, project);
  try {
    const entries = await readdir(projectDir, { withFileTypes: true });
    if (!entries) {
      // unreachable, keeps flow explicit
    }
  } catch {
    return {
      ok: false,
      error: { code: "PROJECT_NOT_FOUND", message: "Project not found." },
    };
  }

  const taskPath = path.join(defaultRepoRoot, project, `${id}.md`);
  let currentContent;
  try {
    currentContent = await readFile(taskPath, "utf8");
  } catch {
    return { ok: false, error: { code: "TASK_NOT_FOUND", message: "Task not found." } };
  }

  const task = parseTaskMarkdown(currentContent);
  if (!task || task.id !== id || task.project !== project) {
    return {
      ok: false,
      error: { code: "INVALID_TASK_FORMAT", message: "Invalid task format." },
    };
  }

  if (task.status !== "backlog") {
    return {
      ok: false,
      error: {
        code: "INVALID_STATUS_TRANSITION",
        message: "Invalid status transition.",
      },
    };
  }

  const worktreeError = await assertCleanWorktree(defaultRepoRoot);
  if (worktreeError) {
    return { ok: false, error: worktreeError };
  }

  const next = { ...task, status: "todo" };
  const updatedContent = serializeTaskMarkdown(next);
  try {
    await writeFile(taskPath, updatedContent, "utf8");
    await commitAll(defaultRepoRoot, `promote_to_todo ${id}`);
  } catch {
    return {
      ok: false,
      error: { code: "IO_ERROR", message: "Failed to promote task." },
    };
  }

  return {
    ok: true,
    data: {
      id: next.id,
      project: next.project,
      type: next.type,
      title: next.title,
      status: next.status,
      created_at: next.created_at,
    },
  };
}

async function executeTasksClaim(input) {
  const project = input?.project;
  const id = input?.id;
  const tool = input?.tool;

  if (typeof project !== "string" || !isValidProjectName(project)) {
    return {
      ok: false,
      error: { code: "INVALID_PROJECT_NAME", message: "Invalid project name." },
    };
  }
  if (!isValidTaskId(id)) {
    return {
      ok: false,
      error: { code: "INVALID_TASK_FORMAT", message: "Invalid task id." },
    };
  }
  if (typeof tool !== "undefined") {
    if (typeof tool !== "string" || tool.trim() === "") {
      return {
        ok: false,
        error: { code: "INVALID_TASK_FORMAT", message: "Invalid tool." },
      };
    }
  }

  const projectDir = path.join(defaultRepoRoot, project);
  try {
    const entries = await readdir(projectDir, { withFileTypes: true });
    if (!entries) {
      // unreachable
    }
  } catch {
    return {
      ok: false,
      error: { code: "PROJECT_NOT_FOUND", message: "Project not found." },
    };
  }

  const taskPath = path.join(defaultRepoRoot, project, `${id}.md`);
  let currentContent;
  try {
    currentContent = await readFile(taskPath, "utf8");
  } catch {
    return { ok: false, error: { code: "TASK_NOT_FOUND", message: "Task not found." } };
  }

  const task = parseTaskMarkdown(currentContent);
  if (!task || task.id !== id || task.project !== project) {
    return {
      ok: false,
      error: { code: "INVALID_TASK_FORMAT", message: "Invalid task format." },
    };
  }
  if (task.status !== "todo") {
    return {
      ok: false,
      error: {
        code: "INVALID_STATUS_TRANSITION",
        message: "Invalid status transition.",
      },
    };
  }

  if (task.started_at || task.done_at || task.canceled_at || task.tool) {
    return {
      ok: false,
      error: { code: "INVALID_TASK_FORMAT", message: "Invalid task format." },
    };
  }

  const worktreeError = await assertCleanWorktree(defaultRepoRoot);
  if (worktreeError) {
    return { ok: false, error: worktreeError };
  }

  const started_at = nowIsoWithOffset();
  const next = {
    ...task,
    status: "in_progress",
    started_at,
    tool: typeof tool === "string" ? tool : undefined,
    done_at: undefined,
    canceled_at: undefined,
  };

  const updatedContent = serializeTaskMarkdown(next);
  try {
    await writeFile(taskPath, updatedContent, "utf8");
    await commitAll(defaultRepoRoot, `claim ${id}`);
  } catch {
    return {
      ok: false,
      error: { code: "IO_ERROR", message: "Failed to claim task." },
    };
  }

  return {
    ok: true,
    data: {
      id: next.id,
      project: next.project,
      type: next.type,
      title: next.title,
      status: next.status,
      created_at: next.created_at,
      started_at: next.started_at,
      tool: next.tool,
    },
  };
}

async function executeTasksDone(input) {
  const project = input?.project;
  const id = input?.id;

  if (typeof project !== "string" || !isValidProjectName(project)) {
    return {
      ok: false,
      error: { code: "INVALID_PROJECT_NAME", message: "Invalid project name." },
    };
  }
  if (!isValidTaskId(id)) {
    return {
      ok: false,
      error: { code: "INVALID_TASK_FORMAT", message: "Invalid task id." },
    };
  }

  const projectDir = path.join(defaultRepoRoot, project);
  try {
    const entries = await readdir(projectDir, { withFileTypes: true });
    if (!entries) {
      // unreachable
    }
  } catch {
    return {
      ok: false,
      error: { code: "PROJECT_NOT_FOUND", message: "Project not found." },
    };
  }

  const taskPath = path.join(defaultRepoRoot, project, `${id}.md`);
  let currentContent;
  try {
    currentContent = await readFile(taskPath, "utf8");
  } catch {
    return { ok: false, error: { code: "TASK_NOT_FOUND", message: "Task not found." } };
  }

  const task = parseTaskMarkdown(currentContent);
  if (!task || task.id !== id || task.project !== project) {
    return {
      ok: false,
      error: { code: "INVALID_TASK_FORMAT", message: "Invalid task format." },
    };
  }
  if (task.status !== "in_progress") {
    return {
      ok: false,
      error: {
        code: "INVALID_STATUS_TRANSITION",
        message: "Invalid status transition.",
      },
    };
  }

  if (!task.started_at || task.done_at || task.canceled_at) {
    return {
      ok: false,
      error: { code: "INVALID_TASK_FORMAT", message: "Invalid task format." },
    };
  }

  const worktreeError = await assertCleanWorktree(defaultRepoRoot);
  if (worktreeError) {
    return { ok: false, error: worktreeError };
  }

  const done_at = nowIsoWithOffset();
  const next = {
    ...task,
    status: "done",
    done_at,
    canceled_at: undefined,
  };

  const updatedContent = serializeTaskMarkdown(next);
  try {
    await writeFile(taskPath, updatedContent, "utf8");
    await commitAll(defaultRepoRoot, `done ${id}`);
  } catch {
    return {
      ok: false,
      error: { code: "IO_ERROR", message: "Failed to complete task." },
    };
  }

  return {
    ok: true,
    data: {
      id: next.id,
      project: next.project,
      type: next.type,
      title: next.title,
      status: next.status,
      created_at: next.created_at,
      done_at: next.done_at,
    },
  };
}

async function executeTasksRelease(input) {
  const project = input?.project;
  const id = input?.id;

  if (typeof project !== "string" || !isValidProjectName(project)) {
    return {
      ok: false,
      error: { code: "INVALID_PROJECT_NAME", message: "Invalid project name." },
    };
  }
  if (!isValidTaskId(id)) {
    return {
      ok: false,
      error: { code: "INVALID_TASK_FORMAT", message: "Invalid task id." },
    };
  }

  const projectDir = path.join(defaultRepoRoot, project);
  try {
    const entries = await readdir(projectDir, { withFileTypes: true });
    if (!entries) {
      // unreachable
    }
  } catch {
    return {
      ok: false,
      error: { code: "PROJECT_NOT_FOUND", message: "Project not found." },
    };
  }

  const taskPath = path.join(defaultRepoRoot, project, `${id}.md`);
  let currentContent;
  try {
    currentContent = await readFile(taskPath, "utf8");
  } catch {
    return { ok: false, error: { code: "TASK_NOT_FOUND", message: "Task not found." } };
  }

  const task = parseTaskMarkdown(currentContent);
  if (!task || task.id !== id || task.project !== project) {
    return {
      ok: false,
      error: { code: "INVALID_TASK_FORMAT", message: "Invalid task format." },
    };
  }
  if (task.status !== "in_progress") {
    return {
      ok: false,
      error: {
        code: "INVALID_STATUS_TRANSITION",
        message: "Invalid status transition.",
      },
    };
  }

  if (!task.started_at || task.done_at || task.canceled_at) {
    return {
      ok: false,
      error: { code: "INVALID_TASK_FORMAT", message: "Invalid task format." },
    };
  }

  const worktreeError = await assertCleanWorktree(defaultRepoRoot);
  if (worktreeError) {
    return { ok: false, error: worktreeError };
  }

  const next = {
    ...task,
    status: "todo",
    started_at: undefined,
    tool: undefined,
    done_at: undefined,
    canceled_at: undefined,
  };

  const updatedContent = serializeTaskMarkdown(next);
  try {
    await writeFile(taskPath, updatedContent, "utf8");
    await commitAll(defaultRepoRoot, `release ${id}`);
  } catch {
    return {
      ok: false,
      error: { code: "IO_ERROR", message: "Failed to release task." },
    };
  }

  return {
    ok: true,
    data: {
      id: next.id,
      project: next.project,
      type: next.type,
      title: next.title,
      status: next.status,
      created_at: next.created_at,
    },
  };
}

async function executeTasksCancel(input) {
  const project = input?.project;
  const id = input?.id;

  if (typeof project !== "string" || !isValidProjectName(project)) {
    return {
      ok: false,
      error: { code: "INVALID_PROJECT_NAME", message: "Invalid project name." },
    };
  }
  if (!isValidTaskId(id)) {
    return {
      ok: false,
      error: { code: "INVALID_TASK_FORMAT", message: "Invalid task id." },
    };
  }

  const projectDir = path.join(defaultRepoRoot, project);
  try {
    const entries = await readdir(projectDir, { withFileTypes: true });
    if (!entries) {
      // unreachable
    }
  } catch {
    return {
      ok: false,
      error: { code: "PROJECT_NOT_FOUND", message: "Project not found." },
    };
  }

  const taskPath = path.join(defaultRepoRoot, project, `${id}.md`);
  let currentContent;
  try {
    currentContent = await readFile(taskPath, "utf8");
  } catch {
    return { ok: false, error: { code: "TASK_NOT_FOUND", message: "Task not found." } };
  }

  const task = parseTaskMarkdown(currentContent);
  if (!task || task.id !== id || task.project !== project) {
    return {
      ok: false,
      error: { code: "INVALID_TASK_FORMAT", message: "Invalid task format." },
    };
  }
  if (task.status === "done" || task.status === "canceled") {
    return {
      ok: false,
      error: {
        code: "INVALID_STATUS_TRANSITION",
        message: "Invalid status transition.",
      },
    };
  }

  if (task.status === "backlog" || task.status === "todo") {
    if (task.started_at || task.done_at || task.tool || task.canceled_at) {
      return {
        ok: false,
        error: { code: "INVALID_TASK_FORMAT", message: "Invalid task format." },
      };
    }
  }

  if (task.status === "in_progress") {
    if (!task.started_at || task.done_at || task.canceled_at) {
      return {
        ok: false,
        error: { code: "INVALID_TASK_FORMAT", message: "Invalid task format." },
      };
    }
  }

  const worktreeError = await assertCleanWorktree(defaultRepoRoot);
  if (worktreeError) {
    return { ok: false, error: worktreeError };
  }

  const canceled_at = nowIsoWithOffset();
  const next = {
    ...task,
    status: "canceled",
    canceled_at,
    done_at: undefined,
  };

  const updatedContent = serializeTaskMarkdown(next);
  try {
    await writeFile(taskPath, updatedContent, "utf8");
    await commitAll(defaultRepoRoot, `cancel ${id}`);
  } catch {
    return {
      ok: false,
      error: { code: "IO_ERROR", message: "Failed to cancel task." },
    };
  }

  return {
    ok: true,
    data: {
      id: next.id,
      project: next.project,
      type: next.type,
      title: next.title,
      status: next.status,
      created_at: next.created_at,
      started_at: next.started_at,
      tool: next.tool,
      canceled_at: next.canceled_at,
    },
  };
}

const ISO_WITH_OFFSET_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?[+-]\d{2}:\d{2}$/;

function parseIsoWithOffsetMs(iso) {
  if (typeof iso !== "string" || !ISO_WITH_OFFSET_REGEX.test(iso)) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return ms;
}

function validateTaskForRead(task, fileNameId) {
  const violations = [];

  if (typeof fileNameId === "string" && fileNameId !== "" && task.id !== fileNameId) {
    violations.push({
      code: "FILE_NAME_MISMATCH",
      message: "File name does not match task id.",
      details: { file_id: fileNameId, task_id: task.id },
    });
  }

  if (!isValidTaskId(task.id)) {
    violations.push({
      code: "INVALID_TASK_ID",
      message: "Invalid task id.",
      details: { id: task.id },
    });
  }

  const createdMs = parseIsoWithOffsetMs(task.created_at);
  if (createdMs === null) {
    violations.push({
      code: "INVALID_TIMESTAMP",
      message: "Invalid timestamp.",
      details: { field: "created_at", value: task.created_at },
    });
  }

  for (const field of ["started_at", "done_at", "canceled_at"]) {
    if (typeof task[field] === "undefined") continue;
    const ms = parseIsoWithOffsetMs(task[field]);
    if (ms === null) {
      violations.push({
        code: "INVALID_TIMESTAMP",
        message: "Invalid timestamp.",
        details: { field, value: task[field] },
      });
    }
  }

  if (task.status === "backlog" || task.status === "todo") {
    for (const field of ["started_at", "done_at", "canceled_at", "tool"]) {
      if (typeof task[field] === "undefined") continue;
      violations.push({
        code: "FORBIDDEN_FIELD",
        message: "Forbidden field for this status.",
        details: { status: task.status, field },
      });
    }
  }

  if (task.status === "in_progress") {
    if (typeof task.started_at !== "string" || task.started_at.trim() === "") {
      violations.push({
        code: "MISSING_REQUIRED_FIELD",
        message: "Missing required field for this status.",
        details: { status: task.status, field: "started_at" },
      });
    }
    for (const field of ["done_at", "canceled_at"]) {
      if (typeof task[field] === "undefined") continue;
      violations.push({
        code: "FORBIDDEN_FIELD",
        message: "Forbidden field for this status.",
        details: { status: task.status, field },
      });
    }
  }

  if (task.status === "done") {
    if (typeof task.done_at !== "string" || task.done_at.trim() === "") {
      violations.push({
        code: "MISSING_REQUIRED_FIELD",
        message: "Missing required field for this status.",
        details: { status: task.status, field: "done_at" },
      });
    }
    if (typeof task.canceled_at !== "undefined") {
      violations.push({
        code: "FORBIDDEN_FIELD",
        message: "Forbidden field for this status.",
        details: { status: task.status, field: "canceled_at" },
      });
    }
  }

  if (task.status === "canceled") {
    if (typeof task.canceled_at !== "string" || task.canceled_at.trim() === "") {
      violations.push({
        code: "MISSING_REQUIRED_FIELD",
        message: "Missing required field for this status.",
        details: { status: task.status, field: "canceled_at" },
      });
    }
    if (typeof task.done_at !== "undefined") {
      violations.push({
        code: "FORBIDDEN_FIELD",
        message: "Forbidden field for this status.",
        details: { status: task.status, field: "done_at" },
      });
    }
  }

  return violations;
}

function taskDetailsView(task) {
  const view = {
    id: task.id,
    project: task.project,
    type: task.type,
    title: task.title,
    status: task.status,
    created_at: task.created_at,
  };

  if (typeof task.started_at === "string") view.started_at = task.started_at;
  if (typeof task.done_at === "string") view.done_at = task.done_at;
  if (typeof task.canceled_at === "string") view.canceled_at = task.canceled_at;
  if (typeof task.tool === "string") view.tool = task.tool;
  if (typeof task.body === "string") view.body = task.body;

  return view;
}

async function executeTasksGet(input) {
  const project = input?.project;
  const id = input?.id;

  if (typeof project !== "string" || !isValidProjectName(project)) {
    return {
      ok: false,
      error: { code: "INVALID_PROJECT_NAME", message: "Invalid project name." },
    };
  }
  if (!isValidTaskId(id)) {
    return { ok: false, error: { code: "INVALID_TASK_FORMAT", message: "Invalid task id." } };
  }

  const projectDir = path.join(defaultRepoRoot, project);
  try {
    await readdir(projectDir);
  } catch {
    return { ok: false, error: { code: "PROJECT_NOT_FOUND", message: "Project not found." } };
  }

  const filePath = path.join(projectDir, `${id}.md`);
  let content;
  try {
    content = await readFile(filePath, "utf8");
  } catch {
    return { ok: false, error: { code: "TASK_NOT_FOUND", message: "Task not found." } };
  }

  const task = parseTaskMarkdown(content);
  if (!task || task.project !== project || task.id !== id) {
    return { ok: false, error: { code: "INVALID_TASK_FORMAT", message: "Invalid task format." } };
  }

  const violations = validateTaskForRead(task, id);
  if (violations.length > 0) {
    return { ok: false, error: { code: "INVALID_TASK_FORMAT", message: "Invalid task format." } };
  }

  return { ok: true, data: taskDetailsView(task) };
}

async function executeTasksReport(input) {
  const project = input?.project;
  const fromIso = input?.from;
  const toIso = input?.to;

  if (typeof project !== "string" || !isValidProjectName(project)) {
    return {
      ok: false,
      error: { code: "INVALID_PROJECT_NAME", message: "Invalid project name." },
    };
  }

  const fromMs = parseIsoWithOffsetMs(fromIso);
  const toMs = parseIsoWithOffsetMs(toIso);
  if (fromMs === null || toMs === null || fromMs > toMs) {
    return { ok: false, error: { code: "INVALID_TASK_FORMAT", message: "Invalid time range." } };
  }

  const projectDir = path.join(defaultRepoRoot, project);
  let entries;
  try {
    entries = await readdir(projectDir, { withFileTypes: true });
  } catch {
    return { ok: false, error: { code: "PROJECT_NOT_FOUND", message: "Project not found." } };
  }

  const files = entries
    .filter((e) => e.isFile() && isTaskMarkdownFile(e.name))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));

  let done_count = 0;
  let remaining_count = 0;

  for (const file of files) {
    const filePath = path.join(projectDir, file);
    let content;
    try {
      content = await readFile(filePath, "utf8");
    } catch {
      return { ok: false, error: { code: "IO_ERROR", message: "Failed to read task." } };
    }

    const task = parseTaskMarkdown(content);
    if (!task) {
      return { ok: false, error: { code: "INVALID_TASK_FORMAT", message: "Invalid task format." } };
    }

    if (task.status === "done") {
      const doneMs = parseIsoWithOffsetMs(task.done_at);
      if (doneMs === null) {
        return {
          ok: false,
          error: { code: "INVALID_TASK_FORMAT", message: "Invalid task format." },
        };
      }
      if (doneMs >= fromMs && doneMs <= toMs) done_count += 1;
      continue;
    }

    if (task.status !== "canceled") {
      remaining_count += 1;
    }
  }

  return { ok: true, data: { done_count, remaining_count } };
}

async function gitLogForFile(filePath) {
  const rel = path.relative(defaultRepoRoot, filePath);
  const { stdout } = await execFileAsync(
    "git",
    ["log", "--date=iso-strict", "--pretty=format:%H%x1f%an%x1f%ad%x1f%s", "--", rel],
    { cwd: defaultRepoRoot },
  );

  const out = stdout.toString().trim();
  if (out === "") return [];

  return out.split("\n").map((line) => {
    const [hash, author, date, subject] = line.split("\x1f");
    return { hash, author, date, subject };
  });
}

async function executeTasksHistory(input) {
  const project = input?.project;
  const id = input?.id;

  if (typeof project !== "string" || !isValidProjectName(project)) {
    return {
      ok: false,
      error: { code: "INVALID_PROJECT_NAME", message: "Invalid project name." },
    };
  }
  if (!isValidTaskId(id)) {
    return { ok: false, error: { code: "INVALID_TASK_FORMAT", message: "Invalid task id." } };
  }

  const projectDir = path.join(defaultRepoRoot, project);
  try {
    await readdir(projectDir);
  } catch {
    return { ok: false, error: { code: "PROJECT_NOT_FOUND", message: "Project not found." } };
  }

  const filePath = path.join(projectDir, `${id}.md`);
  try {
    await readFile(filePath, "utf8");
  } catch {
    return { ok: false, error: { code: "TASK_NOT_FOUND", message: "Task not found." } };
  }

  try {
    const commits = await gitLogForFile(filePath);
    return { ok: true, data: { commits } };
  } catch {
    return {
      ok: false,
      error: { code: "GIT_OPERATION_FAILED", message: "Git operation failed." },
    };
  }
}

async function executeTasksRollback(input) {
  const project = input?.project;
  const id = input?.id;
  const revision = input?.revision;

  if (typeof project !== "string" || !isValidProjectName(project)) {
    return {
      ok: false,
      error: { code: "INVALID_PROJECT_NAME", message: "Invalid project name." },
    };
  }
  if (!isValidTaskId(id)) {
    return { ok: false, error: { code: "INVALID_TASK_FORMAT", message: "Invalid task id." } };
  }
  if (typeof revision !== "string" || revision.trim() === "") {
    return { ok: false, error: { code: "INVALID_TASK_FORMAT", message: "Invalid revision." } };
  }

  const projectDir = path.join(defaultRepoRoot, project);
  try {
    await readdir(projectDir);
  } catch {
    return { ok: false, error: { code: "PROJECT_NOT_FOUND", message: "Project not found." } };
  }

  const filePath = path.join(projectDir, `${id}.md`);
  try {
    await readFile(filePath, "utf8");
  } catch {
    return { ok: false, error: { code: "TASK_NOT_FOUND", message: "Task not found." } };
  }

  const worktreeError = await assertCleanWorktree(defaultRepoRoot);
  if (worktreeError) {
    return { ok: false, error: worktreeError };
  }

  const rel = path.relative(defaultRepoRoot, filePath);
  try {
    await execFileAsync(
      "git",
      ["restore", "--source", revision, "--staged", "--worktree", "--", rel],
      { cwd: defaultRepoRoot },
    );
    await commitAll(defaultRepoRoot, `rollback ${id} to ${revision}`);
  } catch {
    try {
      await execFileAsync(
        "git",
        ["restore", "--source", "HEAD", "--staged", "--worktree", "--", rel],
        { cwd: defaultRepoRoot },
      );
    } catch {
      // ignore
    }

    return {
      ok: false,
      error: { code: "GIT_OPERATION_FAILED", message: "Git operation failed." },
    };
  }

  let content;
  try {
    content = await readFile(filePath, "utf8");
  } catch {
    return { ok: false, error: { code: "IO_ERROR", message: "Failed to read task." } };
  }

  const task = parseTaskMarkdown(content);
  if (!task || task.project !== project || task.id !== id) {
    return { ok: false, error: { code: "INVALID_TASK_FORMAT", message: "Invalid task format." } };
  }

  const violations = validateTaskForRead(task, id);
  if (violations.length > 0) {
    return { ok: false, error: { code: "INVALID_TASK_FORMAT", message: "Invalid task format." } };
  }

  const view = taskDetailsView(task);
  delete view.body;
  return { ok: true, data: view };
}

async function executeTasksVerify(input) {
  const project = input?.project;
  if (typeof project !== "string" || project.trim() === "") {
    return { ok: false, error: { code: "INVALID_TASK_FORMAT", message: "Invalid project." } };
  }

  const violations = [];
  if (!isValidProjectName(project)) {
    violations.push({
      code: "INVALID_PROJECT_NAME",
      message: "Invalid project name.",
      details: { project },
    });
  }

  const projectDir = path.join(defaultRepoRoot, project);
  let entries;
  try {
    entries = await readdir(projectDir, { withFileTypes: true });
  } catch {
    return { ok: false, error: { code: "PROJECT_NOT_FOUND", message: "Project not found." } };
  }

  const files = entries
    .filter((e) => e.isFile() && isTaskMarkdownFile(e.name))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));

  const ids = [];
  for (const file of files) {
    const fileNameId = file.slice(0, -".md".length);
    const filePath = path.join(projectDir, file);
    let content;
    try {
      content = await readFile(filePath, "utf8");
    } catch {
      return { ok: false, error: { code: "IO_ERROR", message: "Failed to read task." } };
    }

    const task = parseTaskMarkdown(content);
    if (!task) {
      violations.push({
        code: "INVALID_TASK_FORMAT",
        message: "Invalid task format.",
        details: { file },
      });
      continue;
    }

    if (task.project !== project) {
      violations.push({
        code: "INVALID_TASK_FORMAT",
        message: "Task project mismatch.",
        details: { file, task_project: task.project, project },
      });
    }

    ids.push(task.id);
    violations.push(...validateTaskForRead(task, fileNameId));
  }

  const counts = new Map();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const [id, count] of counts.entries()) {
    if (count <= 1) continue;
    violations.push({
      code: "DUPLICATE_TASK_ID",
      message: "Duplicate task id.",
      details: { id, count },
    });
  }

  return { ok: true, data: { violations } };
}

const tools = [
  { name: "projects.list", title: "Projects list", inputSchema: emptyInputSchema },
  {
    name: "tasks.template",
    title: "Task template",
    inputSchema: z.object({ project: z.string(), type: z.string() }).strict(),
  },
  {
    name: "tasks.create",
    title: "Tasks create",
    inputSchema: z
      .object({
        project: z.string(),
        type: z.enum(TASK_TYPES),
        title: z.string(),
        body: z.string().optional(),
      })
      .strict(),
  },
  {
    name: "tasks.get",
    title: "Tasks get",
    inputSchema: z.object({ project: z.string(), id: z.string() }).strict(),
  },
  {
    name: "tasks.update",
    title: "Tasks update",
    inputSchema: z
      .object({
        project: z.string(),
        id: z.string(),
        patch: z
          .object({
            type: z.enum(TASK_TYPES).optional(),
            title: z.string().optional(),
            body: z.string().optional(),
          })
          .passthrough(),
      })
      .strict(),
  },
  {
    name: "tasks.promote_to_todo",
    title: "Tasks promote to todo",
    inputSchema: z.object({ project: z.string(), id: z.string() }).strict(),
  },
  {
    name: "tasks.claim",
    title: "Tasks claim",
    inputSchema: z
      .object({ project: z.string(), id: z.string(), tool: z.string().optional() })
      .strict(),
  },
  {
    name: "tasks.done",
    title: "Tasks done",
    inputSchema: z.object({ project: z.string(), id: z.string() }).strict(),
  },
  {
    name: "tasks.release",
    title: "Tasks release",
    inputSchema: z.object({ project: z.string(), id: z.string() }).strict(),
  },
  {
    name: "tasks.cancel",
    title: "Tasks cancel",
    inputSchema: z.object({ project: z.string(), id: z.string() }).strict(),
  },
  {
    name: "tasks.list",
    title: "Tasks list",
    inputSchema: z
      .object({
        project: z.string(),
        status: z
          .enum(["backlog", "todo", "in_progress", "done", "canceled"])
          .optional(),
        type: z.enum(TASK_TYPES).optional(),
        text: z.string().optional(),
      })
      .strict(),
  },
  {
    name: "tasks.report",
    title: "Tasks report",
    inputSchema: z.object({ project: z.string(), from: z.string(), to: z.string() }).strict(),
  },
  {
    name: "tasks.history",
    title: "Tasks history",
    inputSchema: z.object({ project: z.string(), id: z.string() }).strict(),
  },
  {
    name: "tasks.rollback",
    title: "Tasks rollback",
    inputSchema: z
      .object({ project: z.string(), id: z.string(), revision: z.string() })
      .strict(),
  },
  {
    name: "tasks.verify",
    title: "Tasks verify",
    inputSchema: z.object({ project: z.string() }).strict(),
  },
];

for (const tool of tools) {
  server.registerTool(
    tool.name,
    {
      title: tool.title,
      description: "MCP Task Tracker tool.",
      inputSchema: tool.inputSchema ?? emptyInputSchema,
    },
    async (input) => {
      if (tool.name === "projects.list") {
        const result = await executeProjectsList();
        return toMcpTextResult(result);
      }

      if (tool.name === "tasks.template") {
        const result = await executeTaskTemplate(input);
        return toMcpTextResult(result);
      }

      if (tool.name === "tasks.create") {
        const result = await executeTasksCreate(input);
        return toMcpTextResult(result);
      }

      if (tool.name === "tasks.get") {
        const result = await executeTasksGet(input);
        return toMcpTextResult(result);
      }

      if (tool.name === "tasks.update") {
        const result = await executeTasksUpdate(input);
        return toMcpTextResult(result);
      }

      if (tool.name === "tasks.promote_to_todo") {
        const result = await executeTasksPromoteToTodo(input);
        return toMcpTextResult(result);
      }

      if (tool.name === "tasks.claim") {
        const result = await executeTasksClaim(input);
        return toMcpTextResult(result);
      }

      if (tool.name === "tasks.done") {
        const result = await executeTasksDone(input);
        return toMcpTextResult(result);
      }

      if (tool.name === "tasks.release") {
        const result = await executeTasksRelease(input);
        return toMcpTextResult(result);
      }

      if (tool.name === "tasks.cancel") {
        const result = await executeTasksCancel(input);
        return toMcpTextResult(result);
      }

      if (tool.name === "tasks.list") {
        const result = await executeTasksList(input);
        return toMcpTextResult(result);
      }

      if (tool.name === "tasks.report") {
        const result = await executeTasksReport(input);
        return toMcpTextResult(result);
      }

      if (tool.name === "tasks.history") {
        const result = await executeTasksHistory(input);
        return toMcpTextResult(result);
      }

      if (tool.name === "tasks.rollback") {
        const result = await executeTasksRollback(input);
        return toMcpTextResult(result);
      }

      if (tool.name === "tasks.verify") {
        const result = await executeTasksVerify(input);
        return toMcpTextResult(result);
      }

      return notImplementedResult();
    },
  );
}

function parsePort(value) {
  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Invalid MCP_HTTP_PORT value.");
  }
  return port;
}

const host = process.env.MCP_HTTP_HOST ?? "127.0.0.1";
const port = parsePort(process.env.MCP_HTTP_PORT ?? process.env.PORT ?? "3000");
const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: undefined,
});

await server.connect(transport);

const httpServer = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? host}`);
  if (url.pathname !== "/mcp") {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: { code: "NOT_FOUND", message: "Not found." } }));
    return;
  }

  try {
    await transport.handleRequest(request, response);
  } catch (error) {
    console.error("Failed to handle MCP HTTP request.", error);
    if (!response.headersSent) {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error." },
          id: null,
        }),
      );
    }
  }
});

await new Promise((resolve, reject) => {
  httpServer.once("error", reject);
  httpServer.listen(port, host, () => {
    httpServer.off("error", reject);
    console.error(`MCP tracker HTTP server listening at http://${host}:${port}/mcp`);
    resolve();
  });
});

async function shutdown() {
  httpServer.close();
  await server.close();
}

process.once("SIGINT", async () => {
  await shutdown();
  process.exit(0);
});

process.once("SIGTERM", async () => {
  await shutdown();
  process.exit(0);
});
