import { afterEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Config } from "../src/config/Config.js";
import { GitPort } from "../src/git/GitPort.js";
import { HistoryService } from "../src/git/HistoryService.js";
import { TasksHistoryTool } from "../src/mcp/tools/TasksHistoryTool.js";
import { TaskStore } from "../src/tasks/TaskStore.js";

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

function createTool(repoRoot: string): TasksHistoryTool {
  const config = new Config(repoRoot);
  const store = new TaskStore(config);
  const gitPort = new GitPort(config);
  return new TasksHistoryTool(new HistoryService(store, gitPort));
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map((dir) =>
      rm(dir, { recursive: true, force: true }),
    ),
  );
});

describe("History_returnsGitLogForTaskFile", () => {
  it("returns git log entries for the task file.", async () => {
    const repoRoot = await createTempDir();
    await initGitRepo(repoRoot);

    const projectDir = path.join(repoRoot, "frontend");
    await mkdir(projectDir, { recursive: true });
    await writeFile(
      path.join(projectDir, "FR-001.md"),
      "---\nid: FR-001\nproject: frontend\ntype: user_story\ntitle: \"A\"\nstatus: backlog\ncreated_at: 2026-01-01T00:00:00+00:00\n---\n",
      "utf8",
    );
    await git(repoRoot, ["add", "."]);
    await git(repoRoot, ["commit", "-m", "seed"]);

    await writeFile(
      path.join(projectDir, "FR-001.md"),
      "---\nid: FR-001\nproject: frontend\ntype: user_story\ntitle: \"A\"\nstatus: todo\ncreated_at: 2026-01-01T00:00:00+00:00\n---\n",
      "utf8",
    );
    await git(repoRoot, ["add", "."]);
    await git(repoRoot, ["commit", "-m", "promote"]);

    const tool = createTool(repoRoot);
    const response = await tool.execute({ project: "frontend", id: "FR-001" });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    expect(response.data.commits.length).toBeGreaterThanOrEqual(2);
  });
});

describe("History_taskNotFound", () => {
  it("returns TASK_NOT_FOUND when task file does not exist.", async () => {
    const repoRoot = await createTempDir();
    await initGitRepo(repoRoot);
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

    const tool = createTool(repoRoot);
    const response = await tool.execute({ project: "frontend", id: "FR-404" });

    expect(response.ok).toBe(false);
    if (response.ok) return;

    expect(response.error.code).toBe("TASK_NOT_FOUND");
  });
});

describe("History_gitFailure", () => {
  it("returns GIT_OPERATION_FAILED when git log fails.", async () => {
    const repoRoot = await createTempDir();
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });
    await writeFile(
      path.join(repoRoot, "frontend", "FR-001.md"),
      "---\nid: FR-001\nproject: frontend\ntype: user_story\ntitle: \"A\"\nstatus: backlog\ncreated_at: 2026-01-01T00:00:00+00:00\n---\n",
      "utf8",
    );

    const tool = createTool(repoRoot);
    const response = await tool.execute({ project: "frontend", id: "FR-001" });

    expect(response.ok).toBe(false);
    if (response.ok) return;

    expect(response.error.code).toBe("GIT_OPERATION_FAILED");
  });
});

describe("History_resultIsStructured", () => {
  it("returns commits with hash/author/date/subject fields.", async () => {
    const repoRoot = await createTempDir();
    await initGitRepo(repoRoot);

    const projectDir = path.join(repoRoot, "frontend");
    await mkdir(projectDir, { recursive: true });
    await writeFile(
      path.join(projectDir, "FR-001.md"),
      "---\nid: FR-001\nproject: frontend\ntype: user_story\ntitle: \"A\"\nstatus: backlog\ncreated_at: 2026-01-01T00:00:00+00:00\n---\n",
      "utf8",
    );
    await git(repoRoot, ["add", "."]);
    await git(repoRoot, ["commit", "-m", "seed"]);

    const tool = createTool(repoRoot);
    const response = await tool.execute({ project: "frontend", id: "FR-001" });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    const first = response.data.commits[0];
    expect(first).toHaveProperty("hash");
    expect(first).toHaveProperty("author");
    expect(first).toHaveProperty("date");
    expect(first).toHaveProperty("subject");
  });
});

