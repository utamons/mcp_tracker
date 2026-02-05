import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Config } from "../src/config/Config.js";
import { TaskStore } from "../src/tasks/TaskStore.js";
import { ReportService } from "../src/report/ReportService.js";
import { TasksReportTool } from "../src/mcp/tools/TasksReportTool.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mcp-tracker-"));
  tempDirs.push(dir);
  return dir;
}

function taskMarkdown(fields: {
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
  const lines: string[] = [
    "---",
    `id: ${fields.id}`,
    `project: ${fields.project}`,
    `type: ${fields.type}`,
    `title: ${JSON.stringify(fields.title)}`,
    `status: ${fields.status}`,
    `created_at: ${fields.created_at}`,
  ];
  if (fields.started_at) lines.push(`started_at: ${fields.started_at}`);
  if (fields.done_at) lines.push(`done_at: ${fields.done_at}`);
  if (fields.canceled_at) lines.push(`canceled_at: ${fields.canceled_at}`);
  if (fields.tool) lines.push(`tool: ${JSON.stringify(fields.tool)}`);
  lines.push("---");

  const body = fields.body ? `${fields.body.trimEnd()}\n` : "";
  return `${lines.join("\n")}\n${body}`;
}

function createTool(repoRoot: string): TasksReportTool {
  const config = new Config(repoRoot);
  const store = new TaskStore(config);
  return new TasksReportTool(new ReportService(store));
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map((dir) =>
      rm(dir, { recursive: true, force: true }),
    ),
  );
});

describe("Report_countsDoneInRange_inclusive", () => {
  it("counts done_count by done_at within [from,to] inclusive.", async () => {
    const repoRoot = await createTempDir();
    const projectDir = path.join(repoRoot, "frontend");
    await mkdir(projectDir, { recursive: true });

    await writeFile(
      path.join(projectDir, "FR-001.md"),
      taskMarkdown({
        id: "FR-001",
        project: "frontend",
        type: "user_story",
        title: "A",
        status: "done",
        created_at: "2026-01-01T00:00:00+00:00",
        done_at: "2026-01-01T00:00:00+00:00",
      }),
      "utf8",
    );

    await writeFile(
      path.join(projectDir, "FR-002.md"),
      taskMarkdown({
        id: "FR-002",
        project: "frontend",
        type: "user_story",
        title: "B",
        status: "done",
        created_at: "2026-01-01T00:00:00+00:00",
        done_at: "2026-01-10T00:00:00+00:00",
      }),
      "utf8",
    );

    await writeFile(
      path.join(projectDir, "FR-003.md"),
      taskMarkdown({
        id: "FR-003",
        project: "frontend",
        type: "bug",
        title: "C",
        status: "todo",
        created_at: "2026-01-02T00:00:00+00:00",
      }),
      "utf8",
    );

    const tool = createTool(repoRoot);
    const response = await tool.execute({
      project: "frontend",
      from: "2026-01-01T00:00:00+00:00",
      to: "2026-01-10T00:00:00+00:00",
    });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    expect(response.data.done_count).toBe(2);
  });
});

describe("Report_ignoresTaskTemplates", () => {
  it("ignores *_TEMPLATE.md when building the report.", async () => {
    const repoRoot = await createTempDir();
    const projectDir = path.join(repoRoot, "frontend");
    await mkdir(projectDir, { recursive: true });

    await writeFile(
      path.join(projectDir, "FR-001.md"),
      taskMarkdown({
        id: "FR-001",
        project: "frontend",
        type: "user_story",
        title: "A",
        status: "done",
        created_at: "2026-01-01T00:00:00+00:00",
        done_at: "2026-01-01T00:00:00+00:00",
      }),
      "utf8",
    );

    await writeFile(
      path.join(projectDir, "STORY_TEMPLATE.md"),
      "# Task Template\n\n## Description\n",
      "utf8",
    );
    await writeFile(
      path.join(projectDir, "BUG_TEMPLATE.md"),
      "# Task Template\n\n## Description\n",
      "utf8",
    );

    const tool = createTool(repoRoot);
    const response = await tool.execute({
      project: "frontend",
      from: "2026-01-01T00:00:00+00:00",
      to: "2026-01-10T00:00:00+00:00",
    });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    expect(response.data.done_count).toBe(1);
    expect(response.data.remaining_count).toBe(0);
  });
});

describe("Report_remainingExcludesDoneCanceled", () => {
  it("counts remaining_count excluding done and canceled.", async () => {
    const repoRoot = await createTempDir();
    const projectDir = path.join(repoRoot, "frontend");
    await mkdir(projectDir, { recursive: true });

    await writeFile(
      path.join(projectDir, "FR-001.md"),
      taskMarkdown({
        id: "FR-001",
        project: "frontend",
        type: "user_story",
        title: "A",
        status: "done",
        created_at: "2026-01-01T00:00:00+00:00",
        done_at: "2026-01-03T00:00:00+00:00",
      }),
      "utf8",
    );

    await writeFile(
      path.join(projectDir, "FR-002.md"),
      taskMarkdown({
        id: "FR-002",
        project: "frontend",
        type: "user_story",
        title: "B",
        status: "canceled",
        created_at: "2026-01-01T00:00:00+00:00",
        canceled_at: "2026-01-04T00:00:00+00:00",
      }),
      "utf8",
    );

    await writeFile(
      path.join(projectDir, "FR-003.md"),
      taskMarkdown({
        id: "FR-003",
        project: "frontend",
        type: "bug",
        title: "C",
        status: "todo",
        created_at: "2026-01-02T00:00:00+00:00",
      }),
      "utf8",
    );

    await writeFile(
      path.join(projectDir, "FR-004.md"),
      taskMarkdown({
        id: "FR-004",
        project: "frontend",
        type: "bug",
        title: "D",
        status: "in_progress",
        created_at: "2026-01-02T00:00:00+00:00",
        started_at: "2026-01-02T10:00:00+00:00",
      }),
      "utf8",
    );

    const tool = createTool(repoRoot);
    const response = await tool.execute({
      project: "frontend",
      from: "2026-01-01T00:00:00+00:00",
      to: "2026-01-10T00:00:00+00:00",
    });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    expect(response.data.remaining_count).toBe(2);
  });
});

describe("Report_handlesNoDone", () => {
  it("returns done_count=0 when no done tasks fall into the range.", async () => {
    const repoRoot = await createTempDir();
    const projectDir = path.join(repoRoot, "frontend");
    await mkdir(projectDir, { recursive: true });

    await writeFile(
      path.join(projectDir, "FR-001.md"),
      taskMarkdown({
        id: "FR-001",
        project: "frontend",
        type: "user_story",
        title: "A",
        status: "done",
        created_at: "2026-01-01T00:00:00+00:00",
        done_at: "2026-01-01T00:00:00+00:00",
      }),
      "utf8",
    );

    const tool = createTool(repoRoot);
    const response = await tool.execute({
      project: "frontend",
      from: "2026-02-01T00:00:00+00:00",
      to: "2026-02-10T00:00:00+00:00",
    });

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    expect(response.data.done_count).toBe(0);
  });
});

describe("Report_invalidRange_fromAfterTo", () => {
  it("returns INVALID_TASK_FORMAT when from > to.", async () => {
    const repoRoot = await createTempDir();
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

    const tool = createTool(repoRoot);
    const response = await tool.execute({
      project: "frontend",
      from: "2026-02-11T00:00:00+00:00",
      to: "2026-02-10T00:00:00+00:00",
    });

    expect(response.ok).toBe(false);
    if (response.ok) return;

    expect(response.error.code).toBe("INVALID_TASK_FORMAT");
  });
});

describe("Report_invalidTimestamps", () => {
  it("returns INVALID_TASK_FORMAT when from/to are not valid ISO-8601 timestamps.", async () => {
    const repoRoot = await createTempDir();
    await mkdir(path.join(repoRoot, "frontend"), { recursive: true });

    const tool = createTool(repoRoot);
    const response = await tool.execute({
      project: "frontend",
      from: "not-a-timestamp",
      to: "2026-02-10T00:00:00+00:00",
    });

    expect(response.ok).toBe(false);
    if (response.ok) return;

    expect(response.error.code).toBe("INVALID_TASK_FORMAT");
  });
});
