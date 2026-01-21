import { describe, expect, it } from "vitest";
import { McpServerAdapter } from "../src/mcp/McpServerAdapter.js";
import { ToolRegistry } from "../src/mcp/ToolRegistry.js";
import { ToolsListTool } from "../src/mcp/tools/ToolsListTool.js";

describe("ToolsListTool_returnsRegisteredTools", () => {
  it("возвращает актуальный список зарегистрированных tools.", async () => {
    const registry = new ToolRegistry();
    registry.register({ name: "projects.list" });
    registry.register({ name: "tasks.create" });

    const tool = new ToolsListTool(registry);
    const response = await tool.execute();

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    expect(response.data).toEqual(registry.list());
  });
});

describe("ToolsListTool_includesProjectsAndTasks", () => {
  it("список включает projects.list и все tasks.*.", async () => {
    const registry = new ToolRegistry();
    const adapter = new McpServerAdapter(registry);
    adapter.registerTools(registry);

    const tool = new ToolsListTool(registry);
    const response = await tool.execute();

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    const names = response.data.map((item) => item.name);
    const expected = [
      "projects.list",
      "tasks.create",
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

    for (const name of expected) {
      expect(names).toContain(name);
    }
  });
});

describe("ToolsListTool_responseShape", () => {
  it("формат ответа соответствует ok/data и error.message на английском при ошибке.", async () => {
    const registry = {
      list() {
        throw new Error("Ошибка чтения");
      },
    } as ToolRegistry;

    const tool = new ToolsListTool(registry);
    const response = await tool.execute();

    expect(response.ok).toBe(false);
    if (response.ok) return;

    expect(response.error.code).toBeTypeOf("string");
    expect(response.error.message).toBe("Failed to list tools.");
  });
});

describe("ToolRegistry_isDeterministic", () => {
  it("порядок/выдача списка детерминированы для воспроизводимости тестов.", () => {
    const registry = new ToolRegistry();
    registry.register({ name: "tasks.done" });
    registry.register({ name: "projects.list" });
    registry.register({ name: "tasks.claim" });

    const names = registry.list().map((item) => item.name);
    expect(names).toEqual(["projects.list", "tasks.claim", "tasks.done"]);
  });
});
