import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Config } from "../src/config/Config.js";
import { Logger } from "../src/infra/Logger.js";
import { ProjectRegistry } from "../src/projects/ProjectRegistry.js";
import { TasksVerifyTool } from "../src/mcp/tools/TasksVerifyTool.js";
import { TaskStore } from "../src/tasks/TaskStore.js";
import { ProjectVerifier } from "../src/tasks/ProjectVerifier.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mcp-tracker-"));
  tempDirs.push(dir);
  return dir;
}

function createTool(repoRoot: string): TasksVerifyTool {
  const config = new Config(repoRoot);
  const logger = new Logger();
  const projects = new ProjectRegistry(config, logger);
  const store = new TaskStore(config);
  const verifier = new ProjectVerifier(projects, store);
  return new TasksVerifyTool(verifier);
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map((dir) =>
      rm(dir, { recursive: true, force: true }),
    ),
  );
});

describe("Verify_validProject_noViolations", () => {
  it("returns an empty violations list for a valid project.", async () => {
    const repoRoot = await createTempDir();
    const projectDir = path.join(repoRoot, "frontend");
    await mkdir(projectDir, { recursive: true });
    await writeFile(
      path.join(projectDir, "FR-001.md"),
      "---\nid: FR-001\nproject: frontend\ntype: user_story\ntitle: \"A\"\nstatus: backlog\ncreated_at: 2026-01-01T00:00:00+00:00\n---\n",
      "utf8",
    );

    const tool = createTool(repoRoot);
    const response = await tool.execute({ project: "frontend" });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    expect(response.data.violations).toEqual([]);
  });
});

describe("Verify_ignoresTaskTemplate", () => {
  it("ignores TASK_TEMPLATE.md when verifying tasks.", async () => {
    const repoRoot = await createTempDir();
    const projectDir = path.join(repoRoot, "frontend");
    await mkdir(projectDir, { recursive: true });
    await writeFile(
      path.join(projectDir, "FR-001.md"),
      "---\nid: FR-001\nproject: frontend\ntype: user_story\ntitle: \"A\"\nstatus: backlog\ncreated_at: 2026-01-01T00:00:00+00:00\n---\n",
      "utf8",
    );
    await writeFile(
      path.join(projectDir, "TASK_TEMPLATE.md"),
      "# Task Template\n\n## Description\n",
      "utf8",
    );

    const tool = createTool(repoRoot);
    const response = await tool.execute({ project: "frontend" });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    expect(response.data.violations).toEqual([]);
  });
});

describe("Verify_invalidProjectName", () => {
  it("returns a violation when project name is invalid.", async () => {
    const repoRoot = await createTempDir();
    const projectDir = path.join(repoRoot, "Front End");
    await mkdir(projectDir, { recursive: true });

    const tool = createTool(repoRoot);
    const response = await tool.execute({ project: "Front End" });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    const codes = response.data.violations.map((v) => v.code);
    expect(codes).toContain("INVALID_PROJECT_NAME");
  });
});

describe("Verify_duplicateIds", () => {
  it("returns a uniqueness violation when frontmatter ids are duplicated.", async () => {
    const repoRoot = await createTempDir();
    const projectDir = path.join(repoRoot, "frontend");
    await mkdir(projectDir, { recursive: true });

    await writeFile(
      path.join(projectDir, "FR-001.md"),
      "---\nid: FR-001\nproject: frontend\ntype: user_story\ntitle: \"A\"\nstatus: backlog\ncreated_at: 2026-01-01T00:00:00+00:00\n---\n",
      "utf8",
    );
    await writeFile(
      path.join(projectDir, "FR-002.md"),
      "---\nid: FR-001\nproject: frontend\ntype: user_story\ntitle: \"B\"\nstatus: backlog\ncreated_at: 2026-01-01T00:00:00+00:00\n---\n",
      "utf8",
    );

    const tool = createTool(repoRoot);
    const response = await tool.execute({ project: "frontend" });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    const codes = response.data.violations.map((v) => v.code);
    expect(codes).toContain("DUPLICATE_TASK_ID");
  });
});

describe("Verify_missingRequiredFields", () => {
  it("returns a violation when required fields are missing for the status.", async () => {
    const repoRoot = await createTempDir();
    const projectDir = path.join(repoRoot, "frontend");
    await mkdir(projectDir, { recursive: true });

    await writeFile(
      path.join(projectDir, "FR-001.md"),
      "---\nid: FR-001\nproject: frontend\ntype: user_story\ntitle: \"A\"\nstatus: in_progress\ncreated_at: 2026-01-01T00:00:00+00:00\n---\n",
      "utf8",
    );

    const tool = createTool(repoRoot);
    const response = await tool.execute({ project: "frontend" });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    const codes = response.data.violations.map((v) => v.code);
    expect(codes).toContain("MISSING_REQUIRED_FIELD");
  });
});

describe("Verify_forbiddenFieldsInBacklogTodo", () => {
  it("returns a violation when forbidden system fields exist in backlog/todo.", async () => {
    const repoRoot = await createTempDir();
    const projectDir = path.join(repoRoot, "frontend");
    await mkdir(projectDir, { recursive: true });

    await writeFile(
      path.join(projectDir, "FR-001.md"),
      "---\nid: FR-001\nproject: frontend\ntype: user_story\ntitle: \"A\"\nstatus: backlog\ncreated_at: 2026-01-01T00:00:00+00:00\nstarted_at: 2026-01-01T00:00:00+00:00\ntool: \"codex\"\n---\n",
      "utf8",
    );

    const tool = createTool(repoRoot);
    const response = await tool.execute({ project: "frontend" });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    const codes = response.data.violations.map((v) => v.code);
    expect(codes).toContain("FORBIDDEN_FIELD");
  });
});

describe("Verify_invalidTimestampFormat", () => {
  it("returns a violation when timestamps are not valid ISO-8601 with offset.", async () => {
    const repoRoot = await createTempDir();
    const projectDir = path.join(repoRoot, "frontend");
    await mkdir(projectDir, { recursive: true });

    await writeFile(
      path.join(projectDir, "FR-001.md"),
      "---\nid: FR-001\nproject: frontend\ntype: user_story\ntitle: \"A\"\nstatus: backlog\ncreated_at: not-a-timestamp\n---\n",
      "utf8",
    );

    const tool = createTool(repoRoot);
    const response = await tool.execute({ project: "frontend" });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    const codes = response.data.violations.map((v) => v.code);
    expect(codes).toContain("INVALID_TIMESTAMP");
  });
});

describe("Verify_fileNameMismatch", () => {
  it("returns a violation when file name id does not match frontmatter id.", async () => {
    const repoRoot = await createTempDir();
    const projectDir = path.join(repoRoot, "frontend");
    await mkdir(projectDir, { recursive: true });

    await writeFile(
      path.join(projectDir, "FR-001.md"),
      "---\nid: FR-999\nproject: frontend\ntype: user_story\ntitle: \"A\"\nstatus: backlog\ncreated_at: 2026-01-01T00:00:00+00:00\n---\n",
      "utf8",
    );

    const tool = createTool(repoRoot);
    const response = await tool.execute({ project: "frontend" });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    const codes = response.data.violations.map((v) => v.code);
    expect(codes).toContain("FILE_NAME_MISMATCH");
  });
});
