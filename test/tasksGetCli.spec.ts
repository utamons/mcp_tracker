import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Config } from "../src/config/Config.js";
import { TaskStore, type TaskEntity } from "../src/tasks/TaskStore.js";
import { buildTaskDetails } from "../src/cli/tasks-get.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mcp-tracker-"));
  tempDirs.push(dir);
  return dir;
}

async function seedTask(
  store: TaskStore,
  task: Omit<TaskEntity, "project"> & { project?: string },
): Promise<void> {
  await store.write({
    ...task,
    project: task.project ?? "frontend",
  });
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map((dir) =>
      rm(dir, { recursive: true, force: true }),
    ),
  );
});

describe("tasksGetCli_output", () => {
  it("выводит метаданные и body задачи.", async () => {
    const repoRoot = await createTempDir();
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

    const store = new TaskStore(new Config(repoRoot));
    await seedTask(store, {
      id: "FR-001",
      type: "user_story",
      title: "Example title",
      status: "in_progress",
      created_at: "2026-01-21T10:00:00+00:00",
      started_at: "2026-01-21T10:05:00+00:00",
      tool: "codex",
      body: "Hello\nWorld\n",
    });

    const response = await buildTaskDetails({
      project: "frontend",
      id: "FR-001",
      repoRoot,
    });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    const expected = [
      "id: FR-001",
      "project: frontend",
      "type: user_story",
      "title: Example title",
      "status: in_progress",
      "created_at: 2026-01-21T10:00:00+00:00",
      "started_at: 2026-01-21T10:05:00+00:00",
      "tool: codex",
      "",
      "Hello",
      "World",
    ].join("\n");

    expect(response.output.trimEnd()).toBe(expected);
  });

  it("выводит задачу с type=review.", async () => {
    const repoRoot = await createTempDir();
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

    const store = new TaskStore(new Config(repoRoot));
    await seedTask(store, {
      id: "FR-003",
      type: "review",
      title: "Review task",
      status: "backlog",
      created_at: "2026-01-21T12:00:00+00:00",
    } as any);

    const response = await buildTaskDetails({
      project: "frontend",
      id: "FR-003",
      repoRoot,
    });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    expect(response.output).toContain("type: review");
    expect(response.output).toContain("title: Review task");
  });

  it("выводит только метаданные, если body отсутствует.", async () => {
    const repoRoot = await createTempDir();
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

    const store = new TaskStore(new Config(repoRoot));
    await seedTask(store, {
      id: "FR-002",
      type: "bug",
      title: "No body",
      status: "backlog",
      created_at: "2026-01-21T11:00:00+00:00",
    });

    const response = await buildTaskDetails({
      project: "frontend",
      id: "FR-002",
      repoRoot,
    });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    const expected = [
      "id: FR-002",
      "project: frontend",
      "type: bug",
      "title: No body",
      "status: backlog",
      "created_at: 2026-01-21T11:00:00+00:00",
    ].join("\n");

    expect(response.output.trimEnd()).toBe(expected);
  });
});

describe("tasksGetCli_errors", () => {
  it("возвращает ошибку при невалидном имени проекта.", async () => {
    const repoRoot = await createTempDir();
    const response = await buildTaskDetails({
      project: "Frontend",
      id: "FR-001",
      repoRoot,
    });

    expect(response.ok).toBe(false);
    if (response.ok) return;

    expect(response.error.code).toBe("INVALID_PROJECT_NAME");
  });

  it("возвращает ошибку при невалидном id.", async () => {
    const repoRoot = await createTempDir();
    const response = await buildTaskDetails({
      project: "frontend",
      id: "fr-1",
      repoRoot,
    });

    expect(response.ok).toBe(false);
    if (response.ok) return;

    expect(response.error.code).toBe("INVALID_TASK_ID");
  });

  it("возвращает ошибку при отсутствии задачи.", async () => {
    const repoRoot = await createTempDir();
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

    const response = await buildTaskDetails({
      project: "frontend",
      id: "FR-404",
      repoRoot,
    });

    expect(response.ok).toBe(false);
    if (response.ok) return;

    expect(response.error.code).toBe("TASK_NOT_FOUND");
  });

  it("возвращает ошибку при повреждённом файле задачи.", async () => {
    const repoRoot = await createTempDir();
    const projectDir = path.join(repoRoot, "frontend");
    await mkdir(projectDir, { recursive: true });
    await writeFile(path.join(projectDir, "FR-001.md"), "invalid", "utf8");

    const response = await buildTaskDetails({
      project: "frontend",
      id: "FR-001",
      repoRoot,
    });

    expect(response.ok).toBe(false);
    if (response.ok) return;

    expect(response.error.code).toBe("INVALID_TASK_FORMAT");
  });
});
