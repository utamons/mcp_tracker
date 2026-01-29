import { afterEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Config } from "../src/config/Config.js";
import { GitPort } from "../src/git/GitPort.js";
import { WorktreeGuard } from "../src/git/WorktreeGuard.js";
import { Clock } from "../src/infra/Clock.js";
import { TasksCreateTool } from "../src/mcp/tools/TasksCreateTool.js";
import { IdAllocator } from "../src/tasks/IdAllocator.js";
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

function createTool(repoRoot: string): TasksCreateTool {
  const config = new Config(repoRoot);
  return new TasksCreateTool(
    new WorktreeGuard(config),
    new IdAllocator(config),
    new TaskStore(config),
    new Clock(),
    new GitPort(config),
  );
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map((dir) =>
      rm(dir, { recursive: true, force: true }),
    ),
  );
});

const ISO_WITH_OFFSET_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;

describe("TasksCreate_createsFileWithFrontmatter", () => {
  it("creates a Markdown task file with YAML frontmatter and body.", async () => {
    const repoRoot = await createTempDir();
    await initGitRepo(repoRoot);
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

    const tool = createTool(repoRoot);
    const response = await tool.execute({
      project: "frontend",
      type: "user_story",
      title: "My task",
      body: "## Description\n\nHello",
    });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    const taskPath = path.join(repoRoot, "frontend", "FR-001.md");
    const file = await readFile(taskPath, "utf8");

    expect(file).toMatch(/^---\n[\s\S]*\n---\n/);
    expect(file).toMatch(/\nid:\s*FR-001\n/);
    expect(file).toMatch(/\nproject:\s*frontend\n/);
    expect(file).toMatch(/\ntype:\s*user_story\n/);
    expect(file).toMatch(/\ntitle:\s*/);
    expect(file).toMatch(/\nstatus:\s*backlog\n/);
    expect(file).toMatch(/\ncreated_at:\s*/);
    expect(file).toContain("## Description");
    expect(file).toContain("Hello");
  });
});

describe("TasksCreate_allocatesNextId_emptyProject", () => {
  it("allocates PREFIX and NNN=001 for an empty project folder.", async () => {
    const repoRoot = await createTempDir();
    await initGitRepo(repoRoot);
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

    const tool = createTool(repoRoot);
    const response = await tool.execute({
      project: "frontend",
      type: "user_story",
      title: "My task",
    });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    expect(response.data.id).toBe("FR-001");
  });
});

describe("TasksCreate_allocatesNextId_existingTasks", () => {
  it("allocates NNN=max(existing)+1 for an existing project folder.", async () => {
    const repoRoot = await createTempDir();
    await initGitRepo(repoRoot);

    const projectDir = path.join(repoRoot, "frontend");
    await mkdir(projectDir, { recursive: true });
    await writeFile(path.join(projectDir, "FR-001.md"), "---\nid: FR-001\n---\n");
    await writeFile(path.join(projectDir, "FR-009.md"), "---\nid: FR-009\n---\n");
    await git(repoRoot, ["add", "."]);
    await git(repoRoot, ["commit", "-m", "seed"]);

    const tool = createTool(repoRoot);
    const response = await tool.execute({
      project: "frontend",
      type: "user_story",
      title: "My task",
    });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    expect(response.data.id).toBe("FR-010");
  });
});

describe("TasksCreate_allocatesNextId_after999", () => {
  it("allocates 4-digit IDs after 999 existing tasks.", async () => {
    const repoRoot = await createTempDir();
    await initGitRepo(repoRoot);

    const projectDir = path.join(repoRoot, "frontend");
    await mkdir(projectDir, { recursive: true });
    await writeFile(path.join(projectDir, "FR-998.md"), "---\nid: FR-998\n---\n");
    await writeFile(path.join(projectDir, "FR-999.md"), "---\nid: FR-999\n---\n");
    await git(repoRoot, ["add", "."]);
    await git(repoRoot, ["commit", "-m", "seed"]);

    const tool = createTool(repoRoot);
    const response = await tool.execute({
      project: "frontend",
      type: "user_story",
      title: "My task",
    });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    expect(response.data.id).toBe("FR-1000");
  });
});

describe("TasksCreate_allocatesNextId_existing4Digit", () => {
  it("allocates next 4-digit ID when 4-digit tasks already exist.", async () => {
    const repoRoot = await createTempDir();
    await initGitRepo(repoRoot);

    const projectDir = path.join(repoRoot, "frontend");
    await mkdir(projectDir, { recursive: true });
    await writeFile(path.join(projectDir, "FR-1000.md"), "---\nid: FR-1000\n---\n");
    await git(repoRoot, ["add", "."]);
    await git(repoRoot, ["commit", "-m", "seed"]);

    const tool = createTool(repoRoot);
    const response = await tool.execute({
      project: "frontend",
      type: "user_story",
      title: "My task",
    });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    expect(response.data.id).toBe("FR-1001");
  });
});

describe("TasksCreate_allocatesNextId_after9999", () => {
  it("allocates 5-digit IDs after 9999 existing tasks.", async () => {
    const repoRoot = await createTempDir();
    await initGitRepo(repoRoot);

    const projectDir = path.join(repoRoot, "frontend");
    await mkdir(projectDir, { recursive: true });
    await writeFile(path.join(projectDir, "FR-9999.md"), "---\nid: FR-9999\n---\n");
    await git(repoRoot, ["add", "."]);
    await git(repoRoot, ["commit", "-m", "seed"]);

    const tool = createTool(repoRoot);
    const response = await tool.execute({
      project: "frontend",
      type: "user_story",
      title: "My task",
    });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    expect(response.data.id).toBe("FR-10000");
  });
});

describe("TasksCreate_allocatesNextId_mixedFormats", () => {
  it("picks the max ID across mixed formats.", async () => {
    const repoRoot = await createTempDir();
    await initGitRepo(repoRoot);

    const projectDir = path.join(repoRoot, "frontend");
    await mkdir(projectDir, { recursive: true });
    await writeFile(path.join(projectDir, "FR-099.md"), "---\nid: FR-099\n---\n");
    await writeFile(path.join(projectDir, "FR-1000.md"), "---\nid: FR-1000\n---\n");
    await writeFile(path.join(projectDir, "FR-9999.md"), "---\nid: FR-9999\n---\n");
    await git(repoRoot, ["add", "."]);
    await git(repoRoot, ["commit", "-m", "seed"]);

    const tool = createTool(repoRoot);
    const response = await tool.execute({
      project: "frontend",
      type: "user_story",
      title: "My task",
    });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    expect(response.data.id).toBe("FR-10000");
  });
});

describe("TasksCreate_allocationOverflowSafeInteger", () => {
  it("returns IO_ERROR and does not create a task when ID overflows.", async () => {
    const repoRoot = await createTempDir();
    await initGitRepo(repoRoot);

    const projectDir = path.join(repoRoot, "frontend");
    await mkdir(projectDir, { recursive: true });

    const maxSafe = Number.MAX_SAFE_INTEGER;
    const maxId = `FR-${String(maxSafe)}`;
    await writeFile(path.join(projectDir, `${maxId}.md`), `---\nid: ${maxId}\n---\n`);
    await git(repoRoot, ["add", "."]);
    await git(repoRoot, ["commit", "-m", "seed"]);

    const commitCountBefore = Number(
      (await git(repoRoot, ["rev-list", "--count", "HEAD"])).trim(),
    );

    const tool = createTool(repoRoot);
    const response = await tool.execute({
      project: "frontend",
      type: "user_story",
      title: "My task",
    });

    expect(response.ok).toBe(false);
    if (response.ok) return;

    expect(response.error.code).toBe("IO_ERROR");
    expect(response.error.message).toBe("Failed to allocate task id.");

    const commitCountAfter = Number(
      (await git(repoRoot, ["rev-list", "--count", "HEAD"])).trim(),
    );
    expect(commitCountAfter).toBe(commitCountBefore);

    const files = await readdir(projectDir);
    expect(files).toEqual([`${maxId}.md`]);
  });
});

describe("TasksCreate_handlesAllocatorErrors", () => {
  it("returns IO_ERROR when id allocator throws.", async () => {
    const repoRoot = await createTempDir();
    await initGitRepo(repoRoot);
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

    class FailingAllocator {
      async nextId(): Promise<string> {
        const error = new Error("Task id overflow.");
        (error as { code?: string }).code = "ID_OVERFLOW";
        throw error;
      }
    }

    const config = new Config(repoRoot);
    const tool = new TasksCreateTool(
      new WorktreeGuard(config),
      new FailingAllocator() as IdAllocator,
      new TaskStore(config),
      new Clock(),
      new GitPort(config),
    );

    const commitCountBefore = Number(
      (await git(repoRoot, ["rev-list", "--count", "HEAD"])).trim(),
    );

    const response = await tool.execute({
      project: "frontend",
      type: "user_story",
      title: "My task",
    });

    expect(response.ok).toBe(false);
    if (response.ok) return;

    expect(response.error.code).toBe("IO_ERROR");
    expect(response.error.message).toBe("Failed to allocate task id.");

    const commitCountAfter = Number(
      (await git(repoRoot, ["rev-list", "--count", "HEAD"])).trim(),
    );
    expect(commitCountAfter).toBe(commitCountBefore);

    const files = await readdir(path.join(repoRoot, "frontend"));
    expect(files).toEqual([]);
  });
});

describe("TasksCreate_setsCreatedAtAndStatus", () => {
  it("sets created_at and status=backlog.", async () => {
    const repoRoot = await createTempDir();
    await initGitRepo(repoRoot);
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

    const tool = createTool(repoRoot);
    const response = await tool.execute({
      project: "frontend",
      type: "user_story",
      title: "My task",
    });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    expect(response.data.status).toBe("backlog");
    expect(response.data.created_at).toMatch(ISO_WITH_OFFSET_REGEX);
  });
});

describe("TasksCreate_requiresCleanWorktree", () => {
  it("returns GIT_DIRTY_WORKTREE when git worktree is dirty.", async () => {
    const repoRoot = await createTempDir();
    await initGitRepo(repoRoot);
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

    const commitCountBefore = Number(
      (await git(repoRoot, ["rev-list", "--count", "HEAD"])).trim(),
    );

    await writeFile(path.join(repoRoot, "dirty.txt"), "dirty");

    const tool = createTool(repoRoot);
    const response = await tool.execute({
      project: "frontend",
      type: "user_story",
      title: "My task",
    });

    expect(response.ok).toBe(false);
    if (response.ok) return;

    expect(response.error.code).toBe("GIT_DIRTY_WORKTREE");
    expect(response.error.message).toBeTypeOf("string");

    const commitCountAfter = Number(
      (await git(repoRoot, ["rev-list", "--count", "HEAD"])).trim(),
    );
    expect(commitCountAfter).toBe(commitCountBefore);

    await expect(
      readFile(path.join(repoRoot, "frontend", "FR-001.md"), "utf8"),
    ).rejects.toThrow();
  });
});

describe("TasksCreate_commitsOnce", () => {
  it("creates exactly one git commit on success.", async () => {
    const repoRoot = await createTempDir();
    await initGitRepo(repoRoot);
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

    const commitCountBefore = Number(
      (await git(repoRoot, ["rev-list", "--count", "HEAD"])).trim(),
    );

    const tool = createTool(repoRoot);
    const response = await tool.execute({
      project: "frontend",
      type: "user_story",
      title: "My task",
    });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    const commitCountAfter = Number(
      (await git(repoRoot, ["rev-list", "--count", "HEAD"])).trim(),
    );
    expect(commitCountAfter).toBe(commitCountBefore + 1);
  });
});

describe("TasksCreate_returnsTaskView", () => {
  it("returns TaskView with the minimum fields from the spec.", async () => {
    const repoRoot = await createTempDir();
    await initGitRepo(repoRoot);
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

    const tool = createTool(repoRoot);
    const response = await tool.execute({
      project: "frontend",
      type: "user_story",
      title: "My task",
    });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    expect(response.data).toMatchObject({
      id: "FR-001",
      project: "frontend",
      type: "user_story",
      title: "My task",
      status: "backlog",
    });
    expect(response.data.created_at).toMatch(ISO_WITH_OFFSET_REGEX);
  });
});
