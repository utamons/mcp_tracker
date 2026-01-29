import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Config } from "../src/config/Config.js";
import { TaskStore } from "../src/tasks/TaskStore.js";
import { TasksGetTool } from "../src/mcp/tools/TasksGetTool.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mcp-tracker-"));
  tempDirs.push(dir);
  return dir;
}

function createTool(repoRoot: string): TasksGetTool {
  const config = new Config(repoRoot);
  return new TasksGetTool(new TaskStore(config));
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map((dir) =>
      rm(dir, { recursive: true, force: true }),
    ),
  );
});

describe("TasksGet_returnsTaskDetailsWithBody", () => {
  it("returns an extended task view including body when present.", async () => {
    const repoRoot = await createTempDir();
    const projectDir = path.join(repoRoot, "frontend");
    await mkdir(projectDir, { recursive: true });

    await writeFile(
      path.join(projectDir, "FR-001.md"),
      "---\nid: FR-001\nproject: frontend\ntype: user_story\ntitle: \"A\"\nstatus: backlog\ncreated_at: 2026-01-01T00:00:00+00:00\n---\n## Description\n\nHello\n",
      "utf8",
    );

    const tool = createTool(repoRoot);
    const response = await tool.execute({ project: "frontend", id: "FR-001" });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    expect(response.data.id).toBe("FR-001");
    expect(response.data.body).toContain("## Description");
  });
});

describe("TasksGet_acceptsLongerIds", () => {
  it.each(["FR-1000", "FR-10000"])("accepts %s.", async (id) => {
    const repoRoot = await createTempDir();
    const projectDir = path.join(repoRoot, "frontend");
    await mkdir(projectDir, { recursive: true });

    await writeFile(
      path.join(projectDir, `${id}.md`),
      `---\nid: ${id}\nproject: frontend\ntype: user_story\ntitle: "A"\nstatus: backlog\ncreated_at: 2026-01-01T00:00:00+00:00\n---\n`,
      "utf8",
    );

    const tool = createTool(repoRoot);
    const response = await tool.execute({ project: "frontend", id });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    expect(response.data.id).toBe(id);
  });
});

describe("TasksGet_invalidProjectName", () => {
  it("returns INVALID_PROJECT_NAME when project name is invalid.", async () => {
    const repoRoot = await createTempDir();
    const tool = createTool(repoRoot);
    const response = await tool.execute({ project: "Front End", id: "FR-001" });

    expect(response.ok).toBe(false);
    if (response.ok) return;

    expect(response.error.code).toBe("INVALID_PROJECT_NAME");
  });
});

describe("TasksGet_projectNotFound", () => {
  it("returns PROJECT_NOT_FOUND when project folder does not exist.", async () => {
    const repoRoot = await createTempDir();
    const tool = createTool(repoRoot);
    const response = await tool.execute({ project: "frontend", id: "FR-001" });

    expect(response.ok).toBe(false);
    if (response.ok) return;

    expect(response.error.code).toBe("PROJECT_NOT_FOUND");
  });
});

describe("TasksGet_taskNotFound", () => {
  it("returns TASK_NOT_FOUND when task file does not exist.", async () => {
    const repoRoot = await createTempDir();
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

    const tool = createTool(repoRoot);
    const response = await tool.execute({ project: "frontend", id: "FR-404" });

    expect(response.ok).toBe(false);
    if (response.ok) return;

    expect(response.error.code).toBe("TASK_NOT_FOUND");
  });
});

describe("TasksGet_invalidTaskFormat", () => {
  it("returns INVALID_TASK_FORMAT when invariants are violated.", async () => {
    const repoRoot = await createTempDir();
    const projectDir = path.join(repoRoot, "frontend");
    await mkdir(projectDir, { recursive: true });

    await writeFile(
      path.join(projectDir, "FR-001.md"),
      "---\nid: FR-001\nproject: frontend\ntype: user_story\ntitle: \"A\"\nstatus: todo\ncreated_at: 2026-01-01T00:00:00+00:00\ndone_at: 2026-01-02T00:00:00+00:00\n---\n",
      "utf8",
    );

    const tool = createTool(repoRoot);
    const response = await tool.execute({ project: "frontend", id: "FR-001" });

    expect(response.ok).toBe(false);
    if (response.ok) return;

    expect(response.error.code).toBe("INVALID_TASK_FORMAT");
  });
});

describe("TasksGet_bodyEmptyOmitsBodyField", () => {
  it("omits body field when markdown body is empty.", async () => {
    const repoRoot = await createTempDir();
    const projectDir = path.join(repoRoot, "frontend");
    await mkdir(projectDir, { recursive: true });

    await writeFile(
      path.join(projectDir, "FR-001.md"),
      "---\nid: FR-001\nproject: frontend\ntype: user_story\ntitle: \"A\"\nstatus: backlog\ncreated_at: 2026-01-01T00:00:00+00:00\n---\n",
      "utf8",
    );

    const tool = createTool(repoRoot);
    const response = await tool.execute({ project: "frontend", id: "FR-001" });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    expect(response.data).not.toHaveProperty("body");
  });
});
