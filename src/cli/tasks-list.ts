import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Config } from "../config/Config.js";
import { TaskStore, type TaskEntity } from "../tasks/TaskStore.js";

export type TasksListResult =
  | { ok: true; output: string }
  | { ok: false; error: { code: string; message: string } };

const DEFAULT_REPO_ROOT = path.join(os.homedir(), ".mcp_tracker", "projects");
const STATUSES: TaskEntity["status"][] = ["backlog", "todo", "in_progress"];

function isValidProjectName(name: string): boolean {
  return /^[a-z0-9-]+$/.test(name);
}

function mapError(error: unknown): { code: string; message: string } {
  const code =
    error instanceof Error
      ? (error as unknown as { code?: string }).code
      : undefined;

  switch (code) {
    case "PROJECT_NOT_FOUND":
      return { code: "PROJECT_NOT_FOUND", message: "Project not found." };
    case "INVALID_TASK_FORMAT":
      return { code: "INVALID_TASK_FORMAT", message: "Invalid task format." };
    case "IO_ERROR":
      return { code: "IO_ERROR", message: "Failed to list tasks." };
    default:
      return { code: "IO_ERROR", message: "Failed to list tasks." };
  }
}

function formatTasks(tasks: TaskEntity[]): string {
  const lines: string[] = [];
  for (const status of STATUSES) {
    lines.push(`${status}:`);
    for (const task of tasks) {
      if (task.status !== status) continue;
      lines.push(`${task.id} \u2014 ${task.title}`);
    }
  }
  return lines.join("\n");
}

export async function buildTasksList(input: {
  project: string;
  repoRoot?: string;
}): Promise<TasksListResult> {
  if (!isValidProjectName(input.project)) {
    return {
      ok: false,
      error: { code: "INVALID_PROJECT_NAME", message: "Invalid project name." },
    };
  }

  const repoRoot = input.repoRoot ?? DEFAULT_REPO_ROOT;
  const store = new TaskStore(new Config(repoRoot));

  try {
    const tasks = await store.list(input.project);
    return { ok: true, output: formatTasks(tasks) };
  } catch (error) {
    return { ok: false, error: mapError(error) };
  }
}

async function runCli(): Promise<void> {
  const args = process.argv.slice(2);
  const projectIndex = args.indexOf("--project");
  const project = projectIndex >= 0 ? args[projectIndex + 1] : undefined;

  if (!project) {
    console.error("Missing required --project <name> argument.");
    process.exitCode = 1;
    return;
  }

  const result = await buildTasksList({ project });
  if (!result.ok) {
    console.error(result.error.message);
    process.exitCode = 1;
    return;
  }

  const output = result.output.endsWith("\n")
    ? result.output
    : `${result.output}\n`;
  process.stdout.write(output);
}

const entryPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === entryPath) {
  runCli();
}
