import { afterEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import packageJson from "../package.json" with { type: "json" };
import { buildTaskImport } from "../src/cli/tasks-import.js";

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

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map((dir) =>
      rm(dir, { recursive: true, force: true }),
    ),
  );
});

describe("tasksImportCli_script", () => {
  it("adds an npm script for importing tasks.", () => {
    expect(packageJson.scripts["tasks:import"]).toBe("node src/cli/tasks-import.js");
  });
});

describe("tasksImportCli_success", () => {
  it("creates a task from markdown frontmatter and body.", async () => {
    const repoRoot = await createTempDir();
    await initGitRepo(repoRoot);
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

    const filePath = path.join(repoRoot, "input.md");
    await writeFile(
      filePath,
      [
        "---",
        'title: "Imported task"',
        "type: bug",
        "---",
        "## Description",
        "",
        "Imported body.",
        "",
      ].join("\n"),
      "utf8",
    );

    const response = await buildTaskImport({
      project: "frontend",
      filePath,
      repoRoot,
    });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    expect(response.data.id).toBe("FR-001");
    expect(response.output.trim()).toBe("FR-001");

    const taskFile = await readFile(path.join(repoRoot, "frontend", "FR-001.md"), "utf8");
    expect(taskFile).toContain('title: "Imported task"');
    expect(taskFile).toContain("type: bug");
    expect(taskFile).not.toContain("type: user_story");
    expect(taskFile).not.toContain("---\ntitle:");
    expect(taskFile).toContain("## Description\n\nImported body.");
  });

  it("prefixes title with frontmatter id when title does not contain it.", async () => {
    const repoRoot = await createTempDir();
    await initGitRepo(repoRoot);
    await mkdir(path.join(repoRoot, "desktop-manager"), { recursive: true });

    const filePath = path.join(repoRoot, "input.md");
    await writeFile(
      filePath,
      [
        "---",
        "id: DM-XCRT-006",
        "type: story",
        "title: Зональный трейл `F1/F2/F3`",
        "---",
        "Body.",
        "",
      ].join("\n"),
      "utf8",
    );

    const response = await buildTaskImport({
      project: "desktop-manager",
      filePath,
      repoRoot,
    });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    expect(response.data.title).toBe("DM-XCRT-006 Зональный трейл `F1/F2/F3`");

    const taskFile = await readFile(
      path.join(repoRoot, "desktop-manager", "DM-001.md"),
      "utf8",
    );
    expect(taskFile).toContain('type: user_story');
    expect(taskFile).toContain('title: "DM-XCRT-006 Зональный трейл `F1/F2/F3`"');
  });

  it("does not duplicate frontmatter id when title already contains it.", async () => {
    const repoRoot = await createTempDir();
    await initGitRepo(repoRoot);
    await mkdir(path.join(repoRoot, "desktop-manager"), { recursive: true });

    const filePath = path.join(repoRoot, "input.md");
    await writeFile(
      filePath,
      [
        "---",
        "id: DM-XCRT-006",
        "type: story",
        "title: DM-XCRT-006 Зональный трейл `F1/F2/F3`",
        "---",
        "Body.",
        "",
      ].join("\n"),
      "utf8",
    );

    const response = await buildTaskImport({
      project: "desktop-manager",
      filePath,
      repoRoot,
    });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    expect(response.data.title).toBe("DM-XCRT-006 Зональный трейл `F1/F2/F3`");

    const taskFile = await readFile(
      path.join(repoRoot, "desktop-manager", "DM-001.md"),
      "utf8",
    );
    expect(taskFile).toContain('title: "DM-XCRT-006 Зональный трейл `F1/F2/F3`"');
    expect(taskFile).not.toContain("DM-XCRT-006 DM-XCRT-006");
  });
});

describe("tasksImportCli_errors", () => {
  it("returns an error when file path is missing.", async () => {
    const response = await buildTaskImport({ project: "frontend" });

    expect(response.ok).toBe(false);
    if (response.ok) return;

    expect(response.error.code).toBe("INVALID_ARGUMENTS");
  });

  it("returns an error when project is missing.", async () => {
    const repoRoot = await createTempDir();
    const filePath = path.join(repoRoot, "input.md");
    await writeFile(filePath, "---\ntitle: A\ntype: bug\n---\nBody\n", "utf8");

    const response = await buildTaskImport({ filePath, repoRoot });

    expect(response.ok).toBe(false);
    if (response.ok) return;

    expect(response.error.code).toBe("INVALID_ARGUMENTS");
  });

  it("returns an error when the file has no frontmatter.", async () => {
    const repoRoot = await createTempDir();
    const filePath = path.join(repoRoot, "input.md");
    await writeFile(filePath, "# Task\n\nBody\n", "utf8");

    const response = await buildTaskImport({
      project: "frontend",
      filePath,
      repoRoot,
    });

    expect(response.ok).toBe(false);
    if (response.ok) return;

    expect(response.error.code).toBe("INVALID_IMPORT_FORMAT");
  });

  it("returns an error when title is missing from frontmatter.", async () => {
    const repoRoot = await createTempDir();
    const filePath = path.join(repoRoot, "input.md");
    await writeFile(filePath, "---\ntype: bug\n---\nBody\n", "utf8");

    const response = await buildTaskImport({
      project: "frontend",
      filePath,
      repoRoot,
    });

    expect(response.ok).toBe(false);
    if (response.ok) return;

    expect(response.error.code).toBe("INVALID_IMPORT_FORMAT");
  });

  it("returns an error when type is missing from frontmatter.", async () => {
    const repoRoot = await createTempDir();
    const filePath = path.join(repoRoot, "input.md");
    await writeFile(filePath, "---\ntitle: A\n---\nBody\n", "utf8");

    const response = await buildTaskImport({
      project: "frontend",
      filePath,
      repoRoot,
    });

    expect(response.ok).toBe(false);
    if (response.ok) return;

    expect(response.error.code).toBe("INVALID_IMPORT_FORMAT");
  });
});
