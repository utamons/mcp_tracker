import type { ToolRegistry } from "./ToolRegistry.js";
import { ToolsListTool, type ToolsListResponse } from "./tools/ToolsListTool.js";

export class McpServerAdapter {
  private readonly registry: ToolRegistry;

  constructor(registry: ToolRegistry) {
    this.registry = registry;
  }

  start(): void {
    throw new Error("Not implemented");
  }

  registerTools(registry: ToolRegistry): void {
    const toolNames = [
      "projects.list",
      "task.template",
      "tasks.create",
      "tasks.get",
      "tasks.update",
      "tasks.promote_to_todo",
      "tasks.claim",
      "tasks.done",
      "tasks.release",
      "tasks.cancel",
      "tasks.list",
      "tasks.report",
      "tasks.history",
      "tasks.rollback",
      "tasks.verify",
    ];

    for (const name of toolNames) {
      registry.register({ name });
    }
  }

  async handleToolsList(): Promise<ToolsListResponse> {
    const tool = new ToolsListTool(this.registry);
    return tool.execute();
  }
}
