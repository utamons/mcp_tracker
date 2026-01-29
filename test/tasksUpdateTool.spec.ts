import { afterEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Config } from "../src/config/Config.js";
import { GitPort } from "../src/git/GitPort.js";
import { WorktreeGuard } from "../src/git/WorktreeGuard.js";
import { TasksUpdateTool } from "../src/mcp/tools/TasksUpdateTool.js";
import { TaskPatcher } from "../src/tasks/TaskPatcher.js";
import type { TaskEntity } from "../src/tasks/TaskStore.js";
import { TaskStore } from "../src/tasks/TaskStore.js";
import { WorkflowRules } from "../src/tasks/WorkflowRules.js";

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mcp-tracker-"));
  tempDirs.push(dir);
  return dir;
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.toString();
}

async function initGitRepo(repoRoot: string): Promise<void> {
  await git(repoRoot, ["init"]);
  await git(repoRoot, ["config", "user.email", "test@example.com"]);
  await git(repoRoot, ["config", "user.name", "Test"]);
  await git(repoRoot, ["commit", "--allow-empty", "-m", "init"]);
}

function createTool(repoRoot: string): TasksUpdateTool {
  const config = new Config(repoRoot);
  return new TasksUpdateTool(
    new WorktreeGuard(config),
    new TaskStore(config),
    new WorkflowRules(),
    new TaskPatcher(),
    new GitPort(config),
  );
}

async function seedTask(repoRoot: string, task: TaskEntity): Promise<void> {
  const config = new Config(repoRoot);
  const store = new TaskStore(config);
  await store.write(task);
  await git(repoRoot, ["add", "."]);
  await git(repoRoot, ["commit", "-m", "seed"]);
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map((dir) =>
      rm(dir, { recursive: true, force: true }),
    ),
  );
});

describe("TasksUpdate_backlog_allowsTypeTitleBody", () => {
  it("allows updating type/title/body when status=backlog.", async () => {
    const repoRoot = await createTempDir();
    await initGitRepo(repoRoot);
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

    await seedTask(repoRoot, {
      id: "FR-001",
      project: "frontend",
      type: "bug",
      title: "Old title",
      status: "backlog",
      created_at: "2026-01-01T00:00:00+00:00",
      body: "Old body",
    });

    const tool = createTool(repoRoot);
    const response = await tool.execute({
      project: "frontend",
      id: "FR-001",
      patch: { type: "user_story", title: "New title", body: "New body" },
    });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    const taskPath = path.join(repoRoot, "frontend", "FR-001.md");
    const file = await readFile(taskPath, "utf8");

    expect(file).toMatch(/\ntype:\s*user_story\n/);
    expect(file).toMatch(/\ntitle:\s*/);
    expect(file).toContain("New title");
    expect(file).toContain("New body");
  });
});

describe("TasksUpdate_acceptsLongerIds", () => {
  it.each(["FR-1000", "FR-10000"])("updates %s.", async (id) => {
    const repoRoot = await createTempDir();
    await initGitRepo(repoRoot);
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

    await seedTask(repoRoot, {
      id,
      project: "frontend",
      type: "bug",
      title: "Old title",
      status: "backlog",
      created_at: "2026-01-01T00:00:00+00:00",
      body: "Old body",
    });

    const tool = createTool(repoRoot);
    const response = await tool.execute({
      project: "frontend",
      id,
      patch: { title: "New title" },
    });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    const taskPath = path.join(repoRoot, "frontend", `${id}.md`);
    const file = await readFile(taskPath, "utf8");
    expect(file).toContain("New title");
  });
});

describe("TasksUpdate_invalidIdFormat", () => {
  it.each(["FR-01", "FR-abc", "FR-"])("returns INVALID_TASK_FORMAT for %s.", async (id) => {
    const repoRoot = await createTempDir();
    await initGitRepo(repoRoot);
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

    const tool = createTool(repoRoot);
    const response = await tool.execute({
      project: "frontend",
      id,
      patch: { title: "New title" },
    });

    expect(response.ok).toBe(false);
    if (response.ok) return;

    expect(response.error.code).toBe("INVALID_TASK_FORMAT");
  });
});

describe("TasksUpdate_nonBacklog_forbidden", () => {
  it("returns FORBIDDEN_UPDATE_IN_STATUS in todo/in_progress/done/canceled.", async () => {
    const statuses: TaskEntity["status"][] = [
      "todo",
      "in_progress",
      "done",
      "canceled",
    ];

    for (const status of statuses) {
      const repoRoot = await createTempDir();
      await initGitRepo(repoRoot);
      await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

      await seedTask(repoRoot, {
        id: "FR-001",
        project: "frontend",
        type: "bug",
        title: "Old title",
        status,
        created_at: "2026-01-01T00:00:00+00:00",
        body: "Old body",
      });

      const taskPath = path.join(repoRoot, "frontend", "FR-001.md");
      const before = await readFile(taskPath, "utf8");
      const commitCountBefore = Number(
        (await git(repoRoot, ["rev-list", "--count", "HEAD"])).trim(),
      );

      const tool = createTool(repoRoot);
      const response = await tool.execute({
        project: "frontend",
        id: "FR-001",
        patch: { title: "New title" },
      });

      expect(response.ok).toBe(false);
      if (response.ok) continue;

      expect(response.error.code).toBe("FORBIDDEN_UPDATE_IN_STATUS");

      const commitCountAfter = Number(
        (await git(repoRoot, ["rev-list", "--count", "HEAD"])).trim(),
      );
      expect(commitCountAfter).toBe(commitCountBefore);

      const after = await readFile(taskPath, "utf8");
      expect(after).toBe(before);
    }
  });
});

describe("TasksUpdate_preservesSystemFields", () => {
  it("does not allow patching id/project/status/created_at.", async () => {
    const repoRoot = await createTempDir();
    await initGitRepo(repoRoot);
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

    await seedTask(repoRoot, {
      id: "FR-001",
      project: "frontend",
      type: "bug",
      title: "Old title",
      status: "backlog",
      created_at: "2026-01-01T00:00:00+00:00",
      body: "Old body",
    });

    const tool = createTool(repoRoot);
    const response = await tool.execute({
      project: "frontend",
      id: "FR-001",
      patch: {
        id: "FR-999",
        project: "other",
        status: "done",
        created_at: "1999-01-01T00:00:00+00:00",
        type: "user_story",
        title: "New title",
        body: "New body",
      } as unknown as { type?: "user_story" | "bug"; title?: string; body?: string },
    });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    const taskPath = path.join(repoRoot, "frontend", "FR-001.md");
    const file = await readFile(taskPath, "utf8");

    expect(file).toMatch(/\nid:\s*FR-001\n/);
    expect(file).toMatch(/\nproject:\s*frontend\n/);
    expect(file).toMatch(/\nstatus:\s*backlog\n/);
    expect(file).toMatch(/\ncreated_at:\s*2026-01-01T00:00:00\+00:00\n/);
    expect(file).toMatch(/\ntype:\s*user_story\n/);
    expect(file).toContain("New title");
    expect(file).toContain("New body");
  });
});

describe("TasksUpdate_requiresCleanWorktree", () => {
  it("returns GIT_DIRTY_WORKTREE when git worktree is dirty.", async () => {
    const repoRoot = await createTempDir();
    await initGitRepo(repoRoot);
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

    await seedTask(repoRoot, {
      id: "FR-001",
      project: "frontend",
      type: "bug",
      title: "Old title",
      status: "backlog",
      created_at: "2026-01-01T00:00:00+00:00",
    });

    const taskPath = path.join(repoRoot, "frontend", "FR-001.md");
    const before = await readFile(taskPath, "utf8");
    const commitCountBefore = Number(
      (await git(repoRoot, ["rev-list", "--count", "HEAD"])).trim(),
    );

    await writeFile(path.join(repoRoot, "dirty.txt"), "dirty");

    const tool = createTool(repoRoot);
    const response = await tool.execute({
      project: "frontend",
      id: "FR-001",
      patch: { title: "New title" },
    });

    expect(response.ok).toBe(false);
    if (response.ok) return;

    expect(response.error.code).toBe("GIT_DIRTY_WORKTREE");

    const commitCountAfter = Number(
      (await git(repoRoot, ["rev-list", "--count", "HEAD"])).trim(),
    );
    expect(commitCountAfter).toBe(commitCountBefore);

    const after = await readFile(taskPath, "utf8");
    expect(after).toBe(before);
  });
});

describe("TasksUpdate_commitsOnce", () => {
  it("creates exactly one git commit on success.", async () => {
    const repoRoot = await createTempDir();
    await initGitRepo(repoRoot);
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

    await seedTask(repoRoot, {
      id: "FR-001",
      project: "frontend",
      type: "bug",
      title: "Old title",
      status: "backlog",
      created_at: "2026-01-01T00:00:00+00:00",
    });

    const commitCountBefore = Number(
      (await git(repoRoot, ["rev-list", "--count", "HEAD"])).trim(),
    );

    const tool = createTool(repoRoot);
    const response = await tool.execute({
      project: "frontend",
      id: "FR-001",
      patch: { title: "New title" },
    });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    const commitCountAfter = Number(
      (await git(repoRoot, ["rev-list", "--count", "HEAD"])).trim(),
    );
    expect(commitCountAfter).toBe(commitCountBefore + 1);
  });
});

describe("TasksUpdate_invalidTaskFormat", () => {
  it("returns INVALID_TASK_FORMAT when task file or patch format is invalid.", async () => {
    const repoRoot = await createTempDir();
    await initGitRepo(repoRoot);
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

    const taskPath = path.join(repoRoot, "frontend", "FR-001.md");
    await writeFile(taskPath, "invalid", "utf8");
    await git(repoRoot, ["add", "."]);
    await git(repoRoot, ["commit", "-m", "seed"]);

    const commitCountBefore = Number(
      (await git(repoRoot, ["rev-list", "--count", "HEAD"])).trim(),
    );

    const tool = createTool(repoRoot);
    const response = await tool.execute({
      project: "frontend",
      id: "FR-001",
      patch: { title: "New title" },
    });

    expect(response.ok).toBe(false);
    if (response.ok) return;

    expect(response.error.code).toBe("INVALID_TASK_FORMAT");

    const commitCountAfter = Number(
      (await git(repoRoot, ["rev-list", "--count", "HEAD"])).trim(),
    );
    expect(commitCountAfter).toBe(commitCountBefore);
  });
});
