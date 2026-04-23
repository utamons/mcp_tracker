import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Config } from "../src/config/Config.js";
import { buildTasksList } from "../src/cli/tasks-list.js";
import { TaskStore, type TaskEntity } from "../src/tasks/TaskStore.js";

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

describe("tasksListCli_output", () => {
  it("группирует backlog/todo/in_progress в заданном порядке и игнорирует done/canceled.", async () => {
    const repoRoot = await createTempDir();
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

    const store = new TaskStore(new Config(repoRoot));
    await seedTask(store, {
      id: "FR-001",
      type: "user_story",
      title: "Backlog",
      status: "backlog",
      created_at: "2026-01-21T10:00:00+00:00",
      body: "Body",
    });
    await seedTask(store, {
      id: "FR-002",
      type: "bug",
      title: "Todo",
      status: "todo",
      created_at: "2026-01-21T10:01:00+00:00",
    });
    await seedTask(store, {
      id: "FR-003",
      type: "user_story",
      title: "In progress",
      status: "in_progress",
      created_at: "2026-01-21T10:02:00+00:00",
      started_at: "2026-01-21T10:05:00+00:00",
    });
    await seedTask(store, {
      id: "FR-004",
      type: "user_story",
      title: "Done",
      status: "done",
      created_at: "2026-01-21T10:03:00+00:00",
      done_at: "2026-01-21T10:06:00+00:00",
    });
    await seedTask(store, {
      id: "FR-005",
      type: "bug",
      title: "Canceled",
      status: "canceled",
      created_at: "2026-01-21T10:04:00+00:00",
      canceled_at: "2026-01-21T10:07:00+00:00",
    });

    const response = await buildTasksList({ project: "frontend", repoRoot });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    const expected = [
      "backlog:",
      `FR-001 \u2014 Backlog`,
      "todo:",
      `FR-002 \u2014 Todo`,
      "in_progress:",
      `FR-003 \u2014 In progress`,
    ].join("\n");

    expect(response.output.trimEnd()).toBe(expected);
  });

  it("выводит задачу с type=review.", async () => {
    const repoRoot = await createTempDir();
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

    const store = new TaskStore(new Config(repoRoot));
    await seedTask(store, {
      id: "FR-001",
      type: "review",
      title: "Review task",
      status: "todo",
      created_at: "2026-01-21T10:01:00+00:00",
    } as any);

    const response = await buildTasksList({ project: "frontend", repoRoot });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    expect(response.output).toContain("FR-001 \u2014 Review task");
  });

  it("печатает заголовки статусов даже если список пуст.", async () => {
    const repoRoot = await createTempDir();
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

    const store = new TaskStore(new Config(repoRoot));
    await seedTask(store, {
      id: "FR-002",
      type: "bug",
      title: "Todo",
      status: "todo",
      created_at: "2026-01-21T10:01:00+00:00",
    });

    const response = await buildTasksList({ project: "frontend", repoRoot });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    const expected = [
      "backlog:",
      "todo:",
      `FR-002 \u2014 Todo`,
      "in_progress:",
    ].join("\n");

    expect(response.output.trimEnd()).toBe(expected);
  });
});

describe("tasksListCli_errors", () => {
  it("возвращает ошибку при невалидном имени проекта.", async () => {
    const repoRoot = await createTempDir();
    const response = await buildTasksList({ project: "Frontend", repoRoot });

    expect(response.ok).toBe(false);
    if (response.ok) return;

    expect(response.error.code).toBe("INVALID_PROJECT_NAME");
  });

  it("возвращает ошибку при отсутствии проекта.", async () => {
    const repoRoot = await createTempDir();
    const response = await buildTasksList({ project: "frontend", repoRoot });

    expect(response.ok).toBe(false);
    if (response.ok) return;

    expect(response.error.code).toBe("PROJECT_NOT_FOUND");
  });

  it("возвращает ошибку при повреждённом файле задачи.", async () => {
    const repoRoot = await createTempDir();
    const projectDir = path.join(repoRoot, "frontend");
    await mkdir(projectDir, { recursive: true });
    await writeFile(path.join(projectDir, "FR-001.md"), "invalid", "utf8");

    const response = await buildTasksList({ project: "frontend", repoRoot });

    expect(response.ok).toBe(false);
    if (response.ok) return;

    expect(response.error.code).toBe("INVALID_TASK_FORMAT");
  });
});
