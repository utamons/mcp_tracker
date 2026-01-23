import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Config } from "../src/config/Config.js";
import { TaskTemplateTool } from "../src/mcp/tools/TaskTemplateTool.js";
import { TaskTemplateStore } from "../src/tasks/TaskTemplateStore.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mcp-tracker-"));
  tempDirs.push(dir);
  return dir;
}

function createTool(repoRoot: string): TaskTemplateTool {
  const config = new Config(repoRoot);
  return new TaskTemplateTool(new TaskTemplateStore(config));
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map((dir) =>
      rm(dir, { recursive: true, force: true }),
    ),
  );
});

describe("TaskTemplateTool_returnsTemplateText", () => {
  it("returns the TASK_TEMPLATE.md content from the project folder.", async () => {
    const repoRoot = await createTempDir();
    const projectDir = path.join(repoRoot, "frontend");
    await mkdir(projectDir, { recursive: true });

    const template = "# Task Template\n\n## Description\n";
    await writeFile(path.join(projectDir, "TASK_TEMPLATE.md"), template, "utf8");

    const tool = createTool(repoRoot);
    const response = await tool.execute({ project: "frontend" });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    expect(response.data.template).toBe(template);
  });
});

describe("TaskTemplateTool_invalidProjectName", () => {
  it("returns INVALID_PROJECT_NAME for bad project names.", async () => {
    const repoRoot = await createTempDir();
    const tool = createTool(repoRoot);

    const response = await tool.execute({ project: "Front_End" });

    expect(response.ok).toBe(false);
    if (response.ok) return;

    expect(response.error.code).toBe("INVALID_PROJECT_NAME");
    expect(response.error.message).toBe("Invalid project name.");
  });
});

describe("TaskTemplateTool_projectNotFound", () => {
  it("returns PROJECT_NOT_FOUND when project folder is missing.", async () => {
    const repoRoot = await createTempDir();
    const tool = createTool(repoRoot);

    const response = await tool.execute({ project: "frontend" });

    expect(response.ok).toBe(false);
    if (response.ok) return;

    expect(response.error.code).toBe("PROJECT_NOT_FOUND");
    expect(response.error.message).toBe("Project not found.");
  });
});

describe("TaskTemplateTool_templateNotFound", () => {
  it("returns TASK_TEMPLATE_NOT_FOUND when the template file is missing.", async () => {
    const repoRoot = await createTempDir();
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

    const tool = createTool(repoRoot);
    const response = await tool.execute({ project: "frontend" });

    expect(response.ok).toBe(false);
    if (response.ok) return;

    expect(response.error.code).toBe("TASK_TEMPLATE_NOT_FOUND");
    expect(response.error.message).toBe("Task template not found.");
  });
});

describe("TaskTemplateTool_ioError", () => {
  it("returns IO_ERROR when the template cannot be read.", async () => {
    const repoRoot = await createTempDir();
    const projectDir = path.join(repoRoot, "frontend");
    await mkdir(projectDir, { recursive: true });
    await mkdir(path.join(projectDir, "TASK_TEMPLATE.md"));

    const tool = createTool(repoRoot);
    const response = await tool.execute({ project: "frontend" });

    expect(response.ok).toBe(false);
    if (response.ok) return;

    expect(response.error.code).toBe("IO_ERROR");
    expect(response.error.message).toBe("Failed to read task template.");
  });
});
