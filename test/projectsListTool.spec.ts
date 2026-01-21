import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Config } from "../src/config/Config.js";
import type { Logger } from "../src/infra/Logger.js";
import { ProjectsListTool } from "../src/mcp/tools/ProjectsListTool.js";
import { ProjectRegistry } from "../src/projects/ProjectRegistry.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mcp-tracker-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map((dir) =>
      rm(dir, { recursive: true, force: true }),
    ),
  );
});

describe("ProjectRegistry_list_filtersInvalidNames", () => {
  it("returns only project folders that match ^[a-z0-9-]+$.", async () => {
    const repoRoot = await createTempDir();
    const legacyTasksDir = path.join(repoRoot, "tasks");
    await mkdir(legacyTasksDir, { recursive: true });

    await mkdir(path.join(repoRoot, "frontend"));
    await mkdir(path.join(repoRoot, "dev-ops"));
    await mkdir(path.join(repoRoot, "bad_name"));
    await mkdir(path.join(repoRoot, "Frontend"));

    const logger = { warn: vi.fn() } as unknown as Logger;
    const registry = new ProjectRegistry(new Config(repoRoot), logger);

    const projects = await registry.list();
    expect(projects).toEqual(["dev-ops", "frontend"]);
  });
});

describe("ProjectRegistry_list_logsWarnOnInvalid", () => {
  it("ignores invalid project folders and logs warn in English.", async () => {
    const repoRoot = await createTempDir();
    const legacyTasksDir = path.join(repoRoot, "tasks");
    await mkdir(legacyTasksDir, { recursive: true });

    await mkdir(path.join(repoRoot, "bad_name"));
    await mkdir(path.join(repoRoot, "Frontend"));

    const logger = { warn: vi.fn() } as unknown as Logger;
    const registry = new ProjectRegistry(new Config(repoRoot), logger);

    await registry.list();

    expect(logger.warn).toHaveBeenCalledWith("Ignoring invalid project name.", {
      name: "bad_name",
    });
    expect(logger.warn).toHaveBeenCalledWith("Ignoring invalid project name.", {
      name: "Frontend",
    });
  });
});

describe("ProjectsListTool_returnsProjects", () => {
  it("returns the project list from ProjectRegistry.", async () => {
    const registry = {
      list: vi.fn(async () => ["frontend", "dev-ops"]),
    } as unknown as ProjectRegistry;

    const tool = new ProjectsListTool(registry);
    const response = await tool.execute();

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    expect(response.data.projects).toEqual(["frontend", "dev-ops"]);
    expect(registry.list).toHaveBeenCalledTimes(1);
  });
});

describe("ProjectsListTool_ioError", () => {
  it("returns IO_ERROR and an English error.message on read failure.", async () => {
    const registry = {
      list: vi.fn(async () => {
        throw new Error("EACCES: permission denied");
      }),
    } as unknown as ProjectRegistry;

    const tool = new ProjectsListTool(registry);
    const response = await tool.execute();

    expect(response.ok).toBe(false);
    if (response.ok) return;

    expect(response.error.code).toBe("IO_ERROR");
    expect(response.error.message).toBe("Failed to read repo root.");
  });
});
