import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import os from "node:os";
import path from "node:path";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
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

  const pattern = new RegExp(`^${prefix}-(\\d{3})\\.md$`);
  let max = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = entry.name.match(pattern);
    if (!match) continue;
    const num = Number(match[1]);
    if (Number.isFinite(num)) max = Math.max(max, num);
  }

  const next = max + 1;
  if (next > 999) {
    return null;
  }

  return `${prefix}-${String(next).padStart(3, "0")}`;
}

function serializeTaskMarkdown({ id, project, type, title, status, created_at, body }) {
  const safeTitle = JSON.stringify(String(title));
  const lines = [
    "---",
    `id: ${id}`,
    `project: ${project}`,
    `type: ${type}`,
    `title: ${safeTitle}`,
    `status: ${status}`,
    `created_at: ${created_at}`,
    "---",
  ];

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
  if (type !== "user_story" && type !== "bug") {
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

  if (!id || !project || !type || !titleRaw || !status || !created_at) {
    return null;
  }

  if (type !== "user_story" && type !== "bug") {
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

  return {
    id,
    project,
    type,
    title,
    status,
    created_at,
    body: body === "" ? undefined : body,
  };
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
  if (typeof id !== "string" || id.trim() === "") {
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
    if (patch.type !== "user_story" && patch.type !== "bug") {
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
  if (typeof id !== "string" || id.trim() === "") {
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

const tools = [
  { name: "projects.list", title: "Projects list", inputSchema: emptyInputSchema },
  {
    name: "tasks.create",
    title: "Tasks create",
    inputSchema: z
      .object({
        project: z.string(),
        type: z.enum(["user_story", "bug"]),
        title: z.string(),
        body: z.string().optional(),
      })
      .strict(),
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
            type: z.enum(["user_story", "bug"]).optional(),
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
  { name: "tasks.claim", title: "Tasks claim" },
  { name: "tasks.done", title: "Tasks done" },
  { name: "tasks.release", title: "Tasks release" },
  { name: "tasks.cancel", title: "Tasks cancel" },
  { name: "tasks.list", title: "Tasks list" },
  { name: "tasks.report", title: "Tasks report" },
  { name: "tasks.history", title: "Tasks history" },
  { name: "tasks.rollback", title: "Tasks rollback" },
  { name: "tasks.verify", title: "Tasks verify" },
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

      if (tool.name === "tasks.create") {
        const result = await executeTasksCreate(input);
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

      return notImplementedResult();
    },
  );
}

const transport = new StdioServerTransport();
await server.connect(transport);
