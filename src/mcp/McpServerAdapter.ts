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
    void registry;
  }

  async handleToolsList(): Promise<ToolsListResponse> {
    const tool = new ToolsListTool(this.registry);
    return tool.execute();
  }
}
