import type { ToolDefinition } from "../ToolDefinition.js";
import type { ToolRegistry } from "../ToolRegistry.js";

export type ToolsListResponse =
  | { ok: true; data: ToolDefinition[] }
  | { ok: false; error: { code: string; message: string } };

export class ToolsListTool {
  constructor(private readonly registry: ToolRegistry) {}

  async execute(): Promise<ToolsListResponse> {
    return { ok: true, data: [] };
  }
}
