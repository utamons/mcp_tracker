import { afterEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Config } from "../src/config/Config.js";
import { GitPort } from "../src/git/GitPort.js";
import { WorktreeGuard } from "../src/git/WorktreeGuard.js";
import { TasksPromoteToTodoTool } from "../src/mcp/tools/TasksPromoteToTodoTool.js";
import { TaskStatusTransitions } from "../src/tasks/TaskStatusTransitions.js";
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

function createTool(repoRoot: string): TasksPromoteToTodoTool {
  const config = new Config(repoRoot);
  return new TasksPromoteToTodoTool(
    new WorktreeGuard(config),
    new TaskStore(config),
    new WorkflowRules(),
    new TaskStatusTransitions(),
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

describe("PromoteToTodo_backlogToTodo", () => {
  it("promotes status backlog→todo and creates a git commit.", async () => {
    const repoRoot = await createTempDir();
    await initGitRepo(repoRoot);
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

    await seedTask(repoRoot, {
      id: "FR-001",
      project: "frontend",
      type: "user_story",
      title: "My task",
      status: "backlog",
      created_at: "2026-01-01T00:00:00+00:00",
      body: "## Description\n\nHello",
    });

    const commitCountBefore = Number(
      (await git(repoRoot, ["rev-list", "--count", "HEAD"])).trim(),
    );

    const tool = createTool(repoRoot);
    const response = await tool.execute({ project: "frontend", id: "FR-001" });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    expect(response.data.status).toBe("todo");

    const taskPath = path.join(repoRoot, "frontend", "FR-001.md");
    const file = await readFile(taskPath, "utf8");
    expect(file).toMatch(/\nstatus:\s*todo\n/);

    const commitCountAfter = Number(
      (await git(repoRoot, ["rev-list", "--count", "HEAD"])).trim(),
    );
    expect(commitCountAfter).toBe(commitCountBefore + 1);
  });
});

describe("PromoteToTodo_acceptsLongerIds", () => {
  it.each(["FR-1000", "FR-10000"])("accepts %s.", async (id) => {
    const repoRoot = await createTempDir();
    await initGitRepo(repoRoot);
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

    await seedTask(repoRoot, {
      id,
      project: "frontend",
      type: "user_story",
      title: "My task",
      status: "backlog",
      created_at: "2026-01-01T00:00:00+00:00",
      body: "Hello",
    });

    const tool = createTool(repoRoot);
    const response = await tool.execute({ project: "frontend", id });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    expect(response.data.id).toBe(id);
  });
});

describe("PromoteToTodo_invalidIdFormat", () => {
  it.each(["FR-01", "FR-abc", "FR-", "fr-001", "F-001", "FRONT-001"])(
    "returns INVALID_TASK_FORMAT for %s.",
    async (id) => {
    const repoRoot = await createTempDir();
    await initGitRepo(repoRoot);
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

    const tool = createTool(repoRoot);
    const response = await tool.execute({ project: "frontend", id });

    expect(response.ok).toBe(false);
    if (response.ok) return;

    expect(response.error.code).toBe("INVALID_TASK_FORMAT");
  },
  );
});

describe("PromoteToTodo_invalidTransition", () => {
  it("returns INVALID_STATUS_TRANSITION when status is not backlog.", async () => {
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
        title: "My task",
        status,
        created_at: "2026-01-01T00:00:00+00:00",
        body: "Hello",
      });

      const taskPath = path.join(repoRoot, "frontend", "FR-001.md");
      const before = await readFile(taskPath, "utf8");
      const commitCountBefore = Number(
        (await git(repoRoot, ["rev-list", "--count", "HEAD"])).trim(),
      );

      const tool = createTool(repoRoot);
      const response = await tool.execute({ project: "frontend", id: "FR-001" });

      expect(response.ok).toBe(false);
      if (response.ok) continue;

      expect(response.error.code).toBe("INVALID_STATUS_TRANSITION");

      const commitCountAfter = Number(
        (await git(repoRoot, ["rev-list", "--count", "HEAD"])).trim(),
      );
      expect(commitCountAfter).toBe(commitCountBefore);

      const after = await readFile(taskPath, "utf8");
      expect(after).toBe(before);
    }
  });
});

describe("PromoteToTodo_requiresCleanWorktree", () => {
  it("returns GIT_DIRTY_WORKTREE when git worktree is dirty.", async () => {
    const repoRoot = await createTempDir();
    await initGitRepo(repoRoot);
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

    await seedTask(repoRoot, {
      id: "FR-001",
      project: "frontend",
      type: "user_story",
      title: "My task",
      status: "backlog",
      created_at: "2026-01-01T00:00:00+00:00",
      body: "Hello",
    });

    const taskPath = path.join(repoRoot, "frontend", "FR-001.md");
    const before = await readFile(taskPath, "utf8");
    const commitCountBefore = Number(
      (await git(repoRoot, ["rev-list", "--count", "HEAD"])).trim(),
    );

    await writeFile(path.join(repoRoot, "dirty.txt"), "dirty");

    const tool = createTool(repoRoot);
    const response = await tool.execute({ project: "frontend", id: "FR-001" });

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

describe("PromoteToTodo_doesNotChangeBody", () => {
  it("does not change task body/user content.", async () => {
    const repoRoot = await createTempDir();
    await initGitRepo(repoRoot);
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

    const originalBody = "## Description\n\nLine 1\n\nLine 2";
    await seedTask(repoRoot, {
      id: "FR-001",
      project: "frontend",
      type: "user_story",
      title: "My task",
      status: "backlog",
      created_at: "2026-01-01T00:00:00+00:00",
      body: originalBody,
    });

    const tool = createTool(repoRoot);
    const response = await tool.execute({ project: "frontend", id: "FR-001" });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    const store = new TaskStore(new Config(repoRoot));
    const updated = await store.read("frontend", "FR-001");
    expect(updated.body).toBe(originalBody);
  });
});
