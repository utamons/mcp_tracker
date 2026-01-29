import { afterEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Config } from "../src/config/Config.js";
import { GitPort } from "../src/git/GitPort.js";
import { RollbackService } from "../src/git/RollbackService.js";
import { WorktreeGuard } from "../src/git/WorktreeGuard.js";
import { TasksRollbackTool } from "../src/mcp/tools/TasksRollbackTool.js";
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

function createTool(repoRoot: string): TasksRollbackTool {
  const config = new Config(repoRoot);
  const store = new TaskStore(config);
  const gitPort = new GitPort(config);
  return new TasksRollbackTool(new RollbackService(new WorktreeGuard(config), store, gitPort));
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map((dir) =>
      rm(dir, { recursive: true, force: true }),
    ),
  );
});

describe("Rollback_restoresFileAndCommits", () => {
  it("restores file to revision and creates a new git commit.", async () => {
    const repoRoot = await createTempDir();
    await initGitRepo(repoRoot);

    const projectDir = path.join(repoRoot, "frontend");
    await mkdir(projectDir, { recursive: true });

    const initial = "---\nid: FR-001\nproject: frontend\ntype: user_story\ntitle: \"A\"\nstatus: backlog\ncreated_at: 2026-01-01T00:00:00+00:00\n---\n";
    await writeFile(path.join(projectDir, "FR-001.md"), initial, "utf8");
    await git(repoRoot, ["add", "."]);
    await git(repoRoot, ["commit", "-m", "seed"]);

    const rev = (await git(repoRoot, ["rev-parse", "HEAD"])).trim();

    const updated = "---\nid: FR-001\nproject: frontend\ntype: user_story\ntitle: \"A\"\nstatus: todo\ncreated_at: 2026-01-01T00:00:00+00:00\n---\n";
    await writeFile(path.join(projectDir, "FR-001.md"), updated, "utf8");
    await git(repoRoot, ["add", "."]);
    await git(repoRoot, ["commit", "-m", "promote"]);

    const commitCountBefore = Number((await git(repoRoot, ["rev-list", "--count", "HEAD"])).trim());

    const tool = createTool(repoRoot);
    const response = await tool.execute({ project: "frontend", id: "FR-001", revision: rev });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    const commitCountAfter = Number((await git(repoRoot, ["rev-list", "--count", "HEAD"])).trim());
    expect(commitCountAfter).toBe(commitCountBefore + 1);

    const file = await readFile(path.join(projectDir, "FR-001.md"), "utf8");
    expect(file).toBe(initial);

    const subject = (await git(repoRoot, ["log", "-1", "--pretty=%s"])).trim();
    expect(subject).toBe(`rollback FR-001 to ${rev}`);
  });
});

describe("Rollback_acceptsLongerIds", () => {
  it.each(["FR-1000", "FR-10000"])("accepts %s.", async (id) => {
    const repoRoot = await createTempDir();
    await initGitRepo(repoRoot);

    const projectDir = path.join(repoRoot, "frontend");
    await mkdir(projectDir, { recursive: true });

    const initial = `---\nid: ${id}\nproject: frontend\ntype: user_story\ntitle: "A"\nstatus: backlog\ncreated_at: 2026-01-01T00:00:00+00:00\n---\n`;
    await writeFile(path.join(projectDir, `${id}.md`), initial, "utf8");
    await git(repoRoot, ["add", "."]);
    await git(repoRoot, ["commit", "-m", "seed"]);

    const rev = (await git(repoRoot, ["rev-parse", "HEAD"])).trim();

    const updated = `---\nid: ${id}\nproject: frontend\ntype: user_story\ntitle: "A"\nstatus: todo\ncreated_at: 2026-01-01T00:00:00+00:00\n---\n`;
    await writeFile(path.join(projectDir, `${id}.md`), updated, "utf8");
    await git(repoRoot, ["add", "."]);
    await git(repoRoot, ["commit", "-m", "promote"]);

    const tool = createTool(repoRoot);
    const response = await tool.execute({ project: "frontend", id, revision: rev });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    const file = await readFile(path.join(projectDir, `${id}.md`), "utf8");
    expect(file).toBe(initial);

    const subject = (await git(repoRoot, ["log", "-1", "--pretty=%s"])).trim();
    expect(subject).toBe(`rollback ${id} to ${rev}`);
  });
});

describe("Rollback_invalidIdFormat", () => {
  it.each(["FR-01", "FR-abc", "FR-"])("returns INVALID_TASK_FORMAT for %s.", async (id) => {
    const repoRoot = await createTempDir();
    await initGitRepo(repoRoot);
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

    const tool = createTool(repoRoot);
    const response = await tool.execute({
      project: "frontend",
      id,
      revision: "HEAD",
    });

    expect(response.ok).toBe(false);
    if (response.ok) return;

    expect(response.error.code).toBe("INVALID_TASK_FORMAT");
  });
});

describe("Rollback_requiresCleanWorktree", () => {
  it("returns GIT_DIRTY_WORKTREE when worktree is dirty.", async () => {
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

    await writeFile(path.join(repoRoot, "dirty.txt"), "dirty", "utf8");

    const commitCountBefore = Number((await git(repoRoot, ["rev-list", "--count", "HEAD"])).trim());

    const tool = createTool(repoRoot);
    const response = await tool.execute({
      project: "frontend",
      id: "FR-001",
      revision: "HEAD",
    });

    expect(response.ok).toBe(false);
    if (response.ok) return;

    expect(response.error.code).toBe("GIT_DIRTY_WORKTREE");

    const commitCountAfter = Number((await git(repoRoot, ["rev-list", "--count", "HEAD"])).trim());
    expect(commitCountAfter).toBe(commitCountBefore);
  });
});

describe("Rollback_invalidRevision", () => {
  it("returns GIT_OPERATION_FAILED when revision does not exist.", async () => {
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

    const commitCountBefore = Number((await git(repoRoot, ["rev-list", "--count", "HEAD"])).trim());
    const fileBefore = await readFile(path.join(projectDir, "FR-001.md"), "utf8");

    const tool = createTool(repoRoot);
    const response = await tool.execute({
      project: "frontend",
      id: "FR-001",
      revision: "does-not-exist",
    });

    expect(response.ok).toBe(false);
    if (response.ok) return;

    expect(response.error.code).toBe("GIT_OPERATION_FAILED");

    const commitCountAfter = Number((await git(repoRoot, ["rev-list", "--count", "HEAD"])).trim());
    expect(commitCountAfter).toBe(commitCountBefore);

    const fileAfter = await readFile(path.join(projectDir, "FR-001.md"), "utf8");
    expect(fileAfter).toBe(fileBefore);
  });
});
