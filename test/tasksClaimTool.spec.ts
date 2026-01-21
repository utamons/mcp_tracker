import { afterEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Config } from "../src/config/Config.js";
import { GitPort } from "../src/git/GitPort.js";
import { WorktreeGuard } from "../src/git/WorktreeGuard.js";
import { Clock } from "../src/infra/Clock.js";
import { TasksClaimTool } from "../src/mcp/tools/TasksClaimTool.js";
import { TaskStatusTransitions } from "../src/tasks/TaskStatusTransitions.js";
import { TaskStore } from "../src/tasks/TaskStore.js";
import { WorkflowRules } from "../src/tasks/WorkflowRules.js";

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];
const ISO_WITH_OFFSET_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;

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

function createTool(repoRoot: string): TasksClaimTool {
  const config = new Config(repoRoot);
  return new TasksClaimTool(
    new WorktreeGuard(config),
    new TaskStore(config),
    new WorkflowRules(),
    new TaskStatusTransitions(),
    new Clock(),
    new GitPort(config),
  );
}

function serializeTaskMarkdown(task: {
  id: string;
  project: string;
  type: "user_story" | "bug";
  title: string;
  status: "backlog" | "todo" | "in_progress" | "done" | "canceled";
  created_at: string;
  started_at?: string;
  done_at?: string;
  canceled_at?: string;
  tool?: string;
  body?: string;
}): string {
  const lines: string[] = [];
  lines.push("---");
  lines.push(`id: ${task.id}`);
  lines.push(`project: ${task.project}`);
  lines.push(`type: ${task.type}`);
  lines.push(`title: ${JSON.stringify(task.title)}`);
  lines.push(`status: ${task.status}`);
  lines.push(`created_at: ${task.created_at}`);
  if (task.started_at) lines.push(`started_at: ${task.started_at}`);
  if (task.done_at) lines.push(`done_at: ${task.done_at}`);
  if (task.canceled_at) lines.push(`canceled_at: ${task.canceled_at}`);
  if (task.tool) lines.push(`tool: ${JSON.stringify(task.tool)}`);
  lines.push("---");
  const body = task.body ? `${task.body.trimEnd()}\n` : "";
  return `${lines.join("\n")}\n${body}`;
}

async function seedTaskFile(repoRoot: string, markdown: string): Promise<void> {
  const taskPath = path.join(repoRoot, "frontend", "FR-001.md");
  await writeFile(taskPath, markdown, "utf8");
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

describe("Claim_todoToInProgress_setsStartedAt", () => {
  it("переводит todo→in_progress и выставляет started_at.", async () => {
    const repoRoot = await createTempDir();
    await initGitRepo(repoRoot);
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

    await seedTaskFile(
      repoRoot,
      serializeTaskMarkdown({
        id: "FR-001",
        project: "frontend",
        type: "user_story",
        title: "My task",
        status: "todo",
        created_at: "2026-01-01T00:00:00+00:00",
        body: "## Description\n\nHello",
      }),
    );

    const tool = createTool(repoRoot);
    const response = await tool.execute({ project: "frontend", id: "FR-001" });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    expect(response.data.status).toBe("in_progress");
    expect(response.data.started_at).toMatch(ISO_WITH_OFFSET_REGEX);

    const taskPath = path.join(repoRoot, "frontend", "FR-001.md");
    const file = await readFile(taskPath, "utf8");
    expect(file).toMatch(/\nstatus:\s*in_progress\n/);
    expect(file).toMatch(/\nstarted_at:\s*\d{4}-\d{2}-\d{2}T/);
  });
});

describe("Claim_setsToolWhenProvided", () => {
  it("сохраняет tool при передаче параметра tool.", async () => {
    const repoRoot = await createTempDir();
    await initGitRepo(repoRoot);
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

    await seedTaskFile(
      repoRoot,
      serializeTaskMarkdown({
        id: "FR-001",
        project: "frontend",
        type: "bug",
        title: "My task",
        status: "todo",
        created_at: "2026-01-01T00:00:00+00:00",
        body: "Hello",
      }),
    );

    const tool = createTool(repoRoot);
    const response = await tool.execute({
      project: "frontend",
      id: "FR-001",
      tool: "codex",
    });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    expect(response.data.tool).toBe("codex");

    const taskPath = path.join(repoRoot, "frontend", "FR-001.md");
    const file = await readFile(taskPath, "utf8");
    expect(file).toContain('\ntool: "codex"\n');
  });
});

describe("Claim_invalidTransition", () => {
  it("при status≠todo возвращает INVALID_STATUS_TRANSITION.", async () => {
    const statuses: Array<
      "backlog" | "in_progress" | "done" | "canceled"
    > = ["backlog", "in_progress", "done", "canceled"];

    for (const status of statuses) {
      const repoRoot = await createTempDir();
      await initGitRepo(repoRoot);
      await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

      await seedTaskFile(
        repoRoot,
        serializeTaskMarkdown({
          id: "FR-001",
          project: "frontend",
          type: "user_story",
          title: "My task",
          status,
          created_at: "2026-01-01T00:00:00+00:00",
          started_at:
            status === "in_progress" ? "2026-01-01T00:00:00+00:00" : undefined,
        }),
      );

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

describe("Claim_requiresCleanWorktree", () => {
  it("при грязном worktree возвращает GIT_DIRTY_WORKTREE.", async () => {
    const repoRoot = await createTempDir();
    await initGitRepo(repoRoot);
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

    await seedTaskFile(
      repoRoot,
      serializeTaskMarkdown({
        id: "FR-001",
        project: "frontend",
        type: "user_story",
        title: "My task",
        status: "todo",
        created_at: "2026-01-01T00:00:00+00:00",
      }),
    );

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

describe("Claim_commitsOnce", () => {
  it("создаёт один commit на успешный claim.", async () => {
    const repoRoot = await createTempDir();
    await initGitRepo(repoRoot);
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

    await seedTaskFile(
      repoRoot,
      serializeTaskMarkdown({
        id: "FR-001",
        project: "frontend",
        type: "user_story",
        title: "My task",
        status: "todo",
        created_at: "2026-01-01T00:00:00+00:00",
      }),
    );

    const commitCountBefore = Number(
      (await git(repoRoot, ["rev-list", "--count", "HEAD"])).trim(),
    );

    const tool = createTool(repoRoot);
    const response = await tool.execute({ project: "frontend", id: "FR-001" });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    const commitCountAfter = Number(
      (await git(repoRoot, ["rev-list", "--count", "HEAD"])).trim(),
    );
    expect(commitCountAfter).toBe(commitCountBefore + 1);
  });
});

describe("Claim_doesNotMutateBody", () => {
  it("не меняет body и пользовательские поля, кроме системных.", async () => {
    const repoRoot = await createTempDir();
    await initGitRepo(repoRoot);
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

    const originalBody = "## Description\n\nLine 1\n\nLine 2";
    await seedTaskFile(
      repoRoot,
      serializeTaskMarkdown({
        id: "FR-001",
        project: "frontend",
        type: "user_story",
        title: "My task",
        status: "todo",
        created_at: "2026-01-01T00:00:00+00:00",
        body: originalBody,
      }),
    );

    const tool = createTool(repoRoot);
    const response = await tool.execute({ project: "frontend", id: "FR-001" });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    const file = await readFile(path.join(repoRoot, "frontend", "FR-001.md"), "utf8");
    expect(file).toContain(originalBody);
  });
});

