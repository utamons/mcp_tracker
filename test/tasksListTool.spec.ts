import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Config } from "../src/config/Config.js";
import { TasksListTool } from "../src/mcp/tools/TasksListTool.js";
import { TaskQueryService } from "../src/tasks/TaskQueryService.js";
import { TaskStore, type TaskEntity } from "../src/tasks/TaskStore.js";
import { TaskTextSearch } from "../src/tasks/TaskTextSearch.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mcp-tracker-"));
  tempDirs.push(dir);
  return dir;
}

function createTool(repoRoot: string): TasksListTool {
  const config = new Config(repoRoot);
  const store = new TaskStore(config);
  const textSearch = new TaskTextSearch();
  const query = new TaskQueryService(store, textSearch);
  return new TasksListTool(query);
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

describe("TasksList_allTasks", () => {
  it("без фильтров возвращает все задачи проекта.", async () => {
    const repoRoot = await createTempDir();
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

    const store = new TaskStore(new Config(repoRoot));
    await seedTask(store, {
      id: "FR-001",
      type: "user_story",
      title: "First",
      status: "backlog",
      created_at: "2026-01-21T10:00:00+00:00",
      body: "Hello",
    });
    await seedTask(store, {
      id: "FR-002",
      type: "bug",
      title: "Second",
      status: "todo",
      created_at: "2026-01-21T11:00:00+00:00",
      body: "World",
    });

    const tool = createTool(repoRoot);
    const response = await tool.execute({ project: "frontend" });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    expect(response.data.tasks.map((t) => t.id)).toEqual(["FR-001", "FR-002"]);
  });
});

describe("TasksList_acceptsLongerIds", () => {
  it("returns tasks with 4+ digit ids.", async () => {
    const repoRoot = await createTempDir();
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

    const store = new TaskStore(new Config(repoRoot));
    await seedTask(store, {
      id: "FR-1000",
      type: "user_story",
      title: "First",
      status: "backlog",
      created_at: "2026-01-21T10:00:00+00:00",
      body: "Hello",
    });
    await seedTask(store, {
      id: "FR-10000",
      type: "bug",
      title: "Second",
      status: "todo",
      created_at: "2026-01-21T11:00:00+00:00",
      body: "World",
    });

    const tool = createTool(repoRoot);
    const response = await tool.execute({ project: "frontend" });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    expect(response.data.tasks.map((t) => t.id)).toEqual(["FR-1000", "FR-10000"]);
  });
});

describe("TasksList_filterByStatus", () => {
  it("с status возвращает только задачи этого статуса.", async () => {
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
      created_at: "2026-01-21T11:00:00+00:00",
      body: "Body",
    });

    const tool = createTool(repoRoot);
    const response = await tool.execute({ project: "frontend", status: "todo" });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    expect(response.data.tasks.map((t) => t.id)).toEqual(["FR-002"]);
  });
});

describe("TasksList_filterByType", () => {
  it("с type возвращает только задачи этого типа.", async () => {
    const repoRoot = await createTempDir();
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

    const store = new TaskStore(new Config(repoRoot));
    await seedTask(store, {
      id: "FR-001",
      type: "user_story",
      title: "Story",
      status: "todo",
      created_at: "2026-01-21T10:00:00+00:00",
      body: "Body",
    });
    await seedTask(store, {
      id: "FR-002",
      type: "bug",
      title: "Bug",
      status: "todo",
      created_at: "2026-01-21T11:00:00+00:00",
      body: "Body",
    });

    const tool = createTool(repoRoot);
    const response = await tool.execute({
      project: "frontend",
      type: "bug",
    } as any);

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    expect(response.data.tasks.map((t) => t.id)).toEqual(["FR-002"]);
  });

  it("с type=review возвращает только review-задачи.", async () => {
    const repoRoot = await createTempDir();
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

    const store = new TaskStore(new Config(repoRoot));
    await seedTask(store, {
      id: "FR-001",
      type: "review",
      title: "Review",
      status: "todo",
      created_at: "2026-01-21T10:00:00+00:00",
      body: "Body",
    } as any);
    await seedTask(store, {
      id: "FR-002",
      type: "bug",
      title: "Bug",
      status: "todo",
      created_at: "2026-01-21T11:00:00+00:00",
      body: "Body",
    });

    const tool = createTool(repoRoot);
    const response = await tool.execute({
      project: "frontend",
      type: "review",
    } as any);

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    expect(response.data.tasks.map((t) => t.id)).toEqual(["FR-001"]);
    expect(response.data.tasks[0].type).toBe("review");
  });
});

describe("TasksList_textSearch_titleAndBody", () => {
  it("с text ищет по title и body.", async () => {
    const repoRoot = await createTempDir();
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

    const store = new TaskStore(new Config(repoRoot));
    await seedTask(store, {
      id: "FR-001",
      type: "user_story",
      title: "Fix login",
      status: "todo",
      created_at: "2026-01-21T10:00:00+00:00",
      body: "No match here",
    });
    await seedTask(store, {
      id: "FR-002",
      type: "bug",
      title: "Unrelated",
      status: "todo",
      created_at: "2026-01-21T11:00:00+00:00",
      body: "Please fix the LOGIN flow",
    });

    const tool = createTool(repoRoot);
    const response = await tool.execute({
      project: "frontend",
      text: "login",
    });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    expect(response.data.tasks.map((t) => t.id)).toEqual(["FR-001", "FR-002"]);
  });
});

describe("TasksList_ignoresTaskTemplates", () => {
  it("игнорирует файлы *_TEMPLATE.md при чтении задач.", async () => {
    const repoRoot = await createTempDir();
    const projectDir = path.join(repoRoot, "frontend");
    await mkdir(projectDir, { recursive: true });

    const store = new TaskStore(new Config(repoRoot));
    await seedTask(store, {
      id: "FR-001",
      type: "user_story",
      title: "Valid",
      status: "todo",
      created_at: "2026-01-21T10:00:00+00:00",
      body: "Body",
    });

    await writeFile(path.join(projectDir, "STORY_TEMPLATE.md"), "template");
    await writeFile(path.join(projectDir, "BUG_TEMPLATE.md"), "template");

    const tool = createTool(repoRoot);
    const response = await tool.execute({ project: "frontend" });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    expect(response.data.tasks.map((t) => t.id)).toEqual(["FR-001"]);
  });
});

describe("TasksList_invalidTaskFormat", () => {
  it("при некорректном формате любой задачи возвращает INVALID_TASK_FORMAT.", async () => {
    const repoRoot = await createTempDir();
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

    const store = new TaskStore(new Config(repoRoot));
    await seedTask(store, {
      id: "FR-001",
      type: "user_story",
      title: "Valid",
      status: "todo",
      created_at: "2026-01-21T10:00:00+00:00",
      body: "Body",
    });

    await writeFile(path.join(repoRoot, "frontend", "FR-002.md"), "broken");

    const tool = createTool(repoRoot);
    const response = await tool.execute({ project: "frontend" });

    expect(response.ok).toBe(false);
    if (response.ok) return;

    expect(response.error.code).toBe("INVALID_TASK_FORMAT");
  });
});

describe("TasksList_projectNotFound", () => {
  it("для несуществующего проекта возвращает PROJECT_NOT_FOUND.", async () => {
    const repoRoot = await createTempDir();
    const tool = createTool(repoRoot);

    const response = await tool.execute({ project: "frontend" });

    expect(response.ok).toBe(false);
    if (response.ok) return;

    expect(response.error.code).toBe("PROJECT_NOT_FOUND");
  });
});
