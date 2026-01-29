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
import { TasksDoneTool } from "../src/mcp/tools/TasksDoneTool.js";
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

function createTool(repoRoot: string): TasksDoneTool {
  const config = new Config(repoRoot);
  return new TasksDoneTool(
    new WorktreeGuard(config),
    new TaskStore(config),
    new WorkflowRules(),
    new TaskStatusTransitions(),
    new Clock(),
    new GitPort(config),
  );
}

async function seedTaskFile(repoRoot: string, markdown: string): Promise<void> {
  const taskPath = path.join(repoRoot, "frontend", "FR-001.md");
  await writeFile(taskPath, markdown, "utf8");
  await git(repoRoot, ["add", "."]);
  await git(repoRoot, ["commit", "-m", "seed"]);
}

async function seedTaskFileWithId(
  repoRoot: string,
  id: string,
  markdown: string,
): Promise<void> {
  const taskPath = path.join(repoRoot, "frontend", `${id}.md`);
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

describe("Done_inProgressToDone_setsDoneAt", () => {
  it("переводит in_progress→done и выставляет done_at.", async () => {
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
      }),
    );

    const tool = createTool(repoRoot);
    const response = await tool.execute({ project: "frontend", id: "FR-001" });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    expect(response.data.status).toBe("done");
    expect(response.data.done_at).toMatch(ISO_WITH_OFFSET_REGEX);

    const taskPath = path.join(repoRoot, "frontend", "FR-001.md");
    const file = await readFile(taskPath, "utf8");
    expect(file).toMatch(/\nstatus:\s*done\n/);
    expect(file).toMatch(/\ndone_at:\s*\d{4}-\d{2}-\d{2}T/);
  });
});

describe("Done_acceptsLongerIds", () => {
  it.each(["FR-1000", "FR-10000"])("accepts %s.", async (id) => {
    const repoRoot = await createTempDir();
    await initGitRepo(repoRoot);
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

    await seedTaskFileWithId(
      repoRoot,
      id,
      serializeTaskMarkdown({
        id,
        project: "frontend",
        type: "user_story",
        title: "My task",
        status: "in_progress",
        created_at: "2026-01-01T00:00:00+00:00",
        started_at: "2026-01-02T00:00:00+00:00",
      }),
    );

    const tool = createTool(repoRoot);
    const response = await tool.execute({ project: "frontend", id });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    expect(response.data.id).toBe(id);
  });
});

describe("Done_invalidIdFormat", () => {
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

describe("Done_invalidTransition", () => {
  it("при status≠in_progress возвращает INVALID_STATUS_TRANSITION.", async () => {
    const statuses: Array<"backlog" | "todo" | "done" | "canceled"> = [
      "backlog",
      "todo",
      "done",
      "canceled",
    ];

    for (const status of statuses) {
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
          status,
          created_at: "2026-01-01T00:00:00+00:00",
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

describe("Done_requiresCleanWorktree", () => {
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
        status: "in_progress",
        created_at: "2026-01-01T00:00:00+00:00",
        started_at: "2026-01-02T00:00:00+00:00",
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

describe("Done_commitsOnce", () => {
  it("создаёт один commit на успешный done.", async () => {
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
