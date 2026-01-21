import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

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
    async () => notImplementedResult(),
  );
}

const transport = new StdioServerTransport();
await server.connect(transport);

