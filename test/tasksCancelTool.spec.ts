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
import { TasksCancelTool } from "../src/mcp/tools/TasksCancelTool.js";
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

function createTool(repoRoot: string): TasksCancelTool {
  const config = new Config(repoRoot);
  return new TasksCancelTool(
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
  return `${lines.join("\n")}\n`;
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

describe("Cancel_fromBacklog_setsCanceledAt", () => {
  it("backlog→canceled выставляет canceled_at и создаёт commit.", async () => {
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
        status: "backlog",
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

    expect(response.data.status).toBe("canceled");
    expect(response.data.canceled_at).toMatch(ISO_WITH_OFFSET_REGEX);

    const file = await readFile(path.join(repoRoot, "frontend", "FR-001.md"), "utf8");
    expect(file).toMatch(/\nstatus:\s*canceled\n/);
    expect(file).toMatch(/\ncanceled_at:\s*\d{4}-\d{2}-\d{2}T/);

    const commitCountAfter = Number(
      (await git(repoRoot, ["rev-list", "--count", "HEAD"])).trim(),
    );
    expect(commitCountAfter).toBe(commitCountBefore + 1);
  });
});

describe("Cancel_fromTodo_setsCanceledAt", () => {
  it("todo→canceled выставляет canceled_at и создаёт commit.", async () => {
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
      }),
    );

    const tool = createTool(repoRoot);
    const response = await tool.execute({ project: "frontend", id: "FR-001" });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    expect(response.data.status).toBe("canceled");
    expect(response.data.canceled_at).toMatch(ISO_WITH_OFFSET_REGEX);
  });
});

describe("Cancel_fromInProgress_keepsStartedAt", () => {
  it("in_progress→canceled сохраняет started_at и выставляет canceled_at.", async () => {
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
        status: "in_progress",
        created_at: "2026-01-01T00:00:00+00:00",
        started_at: "2026-01-02T00:00:00+00:00",
        tool: "codex",
      }),
    );

    const tool = createTool(repoRoot);
    const response = await tool.execute({ project: "frontend", id: "FR-001" });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    expect(response.data.status).toBe("canceled");
    expect(response.data.canceled_at).toMatch(ISO_WITH_OFFSET_REGEX);
    expect(response.data.started_at).toBe("2026-01-02T00:00:00+00:00");
    expect(response.data.tool).toBe("codex");
  });
});

describe("Cancel_invalidTransition", () => {
  it("при status=done возвращает INVALID_STATUS_TRANSITION.", async () => {
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
        status: "done",
        created_at: "2026-01-01T00:00:00+00:00",
        started_at: "2026-01-02T00:00:00+00:00",
        done_at: "2026-01-03T00:00:00+00:00",
      }),
    );

    const tool = createTool(repoRoot);
    const response = await tool.execute({ project: "frontend", id: "FR-001" });

    expect(response.ok).toBe(false);
    if (response.ok) return;

    expect(response.error.code).toBe("INVALID_STATUS_TRANSITION");
  });
});

describe("Cancel_requiresCleanWorktree", () => {
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

describe("Cancel_invalidFieldsInBacklogTodo", () => {
  it("при наличии started_at/tool/done_at в backlog/todo возвращает INVALID_TASK_FORMAT.", async () => {
    const invalidVariants = [
      serializeTaskMarkdown({
        id: "FR-001",
        project: "frontend",
        type: "user_story",
        title: "My task",
        status: "backlog",
        created_at: "2026-01-01T00:00:00+00:00",
        started_at: "2026-01-02T00:00:00+00:00",
      }),
      serializeTaskMarkdown({
        id: "FR-001",
        project: "frontend",
        type: "user_story",
        title: "My task",
        status: "todo",
        created_at: "2026-01-01T00:00:00+00:00",
        tool: "codex",
      }),
      serializeTaskMarkdown({
        id: "FR-001",
        project: "frontend",
        type: "user_story",
        title: "My task",
        status: "todo",
        created_at: "2026-01-01T00:00:00+00:00",
        done_at: "2026-01-02T00:00:00+00:00",
      }),
    ];

    for (const markdown of invalidVariants) {
      const repoRoot = await createTempDir();
      await initGitRepo(repoRoot);
      await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

      await seedTaskFile(repoRoot, markdown);

      const taskPath = path.join(repoRoot, "frontend", "FR-001.md");
      const before = await readFile(taskPath, "utf8");
      const commitCountBefore = Number(
        (await git(repoRoot, ["rev-list", "--count", "HEAD"])).trim(),
      );

      const tool = createTool(repoRoot);
      const response = await tool.execute({ project: "frontend", id: "FR-001" });

      expect(response.ok).toBe(false);
      if (response.ok) continue;

      expect(response.error.code).toBe("INVALID_TASK_FORMAT");

      const commitCountAfter = Number(
        (await git(repoRoot, ["rev-list", "--count", "HEAD"])).trim(),
      );
      expect(commitCountAfter).toBe(commitCountBefore);

      const after = await readFile(taskPath, "utf8");
      expect(after).toBe(before);
    }
  });
});

