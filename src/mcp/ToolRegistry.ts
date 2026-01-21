import type { ToolDefinition } from "./ToolDefinition.js";

export class ToolRegistry {
  private readonly tools: ToolDefinition[] = [];

  register(definition: ToolDefinition): void {
    this.tools.push(definition);
  }

  list(): ToolDefinition[] {
    return [...this.tools].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }
}
