import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import os from "node:os";
import path from "node:path";
import { readdir, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const server = new McpServer({
  name: "mcp-tracker",
  version: "0.1.0",
});

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

const tools = [
  { name: "projects.list", title: "Projects list", inputSchema: {} },
  {
    name: "tasks.create",
    title: "Tasks create",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        type: { type: "string", enum: ["user_story", "bug"] },
        title: { type: "string" },
        body: { type: "string" },
      },
      required: ["project", "type", "title"],
      additionalProperties: false,
    },
  },
  { name: "tasks.update", title: "Tasks update" },
  { name: "tasks.promote_to_todo", title: "Tasks promote to todo" },
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
      inputSchema: tool.inputSchema ?? {},
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

      return notImplementedResult();
    },
  );
}

const transport = new StdioServerTransport();
await server.connect(transport);
