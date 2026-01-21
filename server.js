import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import os from "node:os";
import path from "node:path";
import { readdir } from "node:fs/promises";

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

const tools = [
  { name: "projects.list", title: "Projects list" },
  { name: "tasks.create", title: "Tasks create" },
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
      inputSchema: {},
    },
    async () => {
      if (tool.name === "projects.list") {
        const result = await executeProjectsList();
        return toMcpTextResult(result);
      }

      return notImplementedResult();
    },
  );
}

const transport = new StdioServerTransport();
await server.connect(transport);
