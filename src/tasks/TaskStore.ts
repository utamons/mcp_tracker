import type { Config } from "../config/Config.js";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseTask, serializeTask } from "./TaskParser.js";
import { isValidTaskId } from "./TaskId.js";
import { isTaskMarkdownFile } from "./TaskFiles.js";

export type TaskEntity = {
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
};

export class TaskStore {
  constructor(private readonly _config: Config) {}

  taskPath(_project: string, _id: string): string {
    return path.join(this._config.getRepoRoot(), _project, `${_id}.md`);
  }

  projectDirPath(_project: string): string {
    return path.join(this._config.getRepoRoot(), _project);
  }

  async read(_project: string, _id: string): Promise<TaskEntity> {
    const filePath = this.taskPath(_project, _id);
    let content: string;
    try {
      content = await readFile(filePath, "utf8");
    } catch (error) {
      const code =
        error instanceof Error
          ? (error as unknown as { code?: string }).code
          : undefined;

      if (code === "ENOENT") {
        const notFound = new Error("Task not found.");
        (notFound as unknown as { code: string }).code = "TASK_NOT_FOUND";
        throw notFound;
      }

      const io = new Error("Failed to read task.");
      (io as unknown as { code: string }).code = "IO_ERROR";
      throw io;
    }

    const task = parseTask(content);
    if (!isValidTaskId(_id) || !isValidTaskId(task.id)) {
      const invalid = new Error("Invalid task format.");
      (invalid as unknown as { code: string }).code = "INVALID_TASK_FORMAT";
      throw invalid;
    }
    if (task.project !== _project || task.id !== _id) {
      const invalid = new Error("Invalid task format.");
      (invalid as unknown as { code: string }).code = "INVALID_TASK_FORMAT";
      throw invalid;
    }

    return task;
  }

  async write(_task: TaskEntity): Promise<void> {
    const content = serializeTask(_task);
    await writeFile(this.taskPath(_task.project, _task.id), content, "utf8");
  }

  async list(_project: string): Promise<TaskEntity[]> {
    const projectDir = this.projectDirPath(_project);
    let entries;
    try {
      entries = await readdir(projectDir, { withFileTypes: true });
    } catch (error) {
      const code =
        error instanceof Error
          ? (error as unknown as { code?: string }).code
          : undefined;

      if (code === "ENOENT") {
        const notFound = new Error("Project not found.");
        (notFound as unknown as { code: string }).code = "PROJECT_NOT_FOUND";
        throw notFound;
      }

      const io = new Error("Failed to list tasks.");
      (io as unknown as { code: string }).code = "IO_ERROR";
      throw io;
    }

    const files = entries
      .filter((entry) => entry.isFile() && isTaskMarkdownFile(entry.name))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));

    const tasks: TaskEntity[] = [];
    for (const fileName of files) {
      const expectedId = fileName.slice(0, -".md".length);
      const filePath = path.join(projectDir, fileName);

      let content: string;
      try {
        content = await readFile(filePath, "utf8");
      } catch {
        const io = new Error("Failed to read task.");
        (io as unknown as { code: string }).code = "IO_ERROR";
        throw io;
      }

      let task: TaskEntity;
      try {
        task = parseTask(content);
      } catch (error) {
        const code =
          error instanceof Error
            ? (error as unknown as { code?: string }).code
            : undefined;

        if (code === "INVALID_TASK_FORMAT") {
          throw error;
        }

        const invalid = new Error("Invalid task format.");
        (invalid as unknown as { code: string }).code = "INVALID_TASK_FORMAT";
        throw invalid;
      }

      if (!isValidTaskId(expectedId) || !isValidTaskId(task.id)) {
        const invalid = new Error("Invalid task format.");
        (invalid as unknown as { code: string }).code = "INVALID_TASK_FORMAT";
        throw invalid;
      }
      if (task.project !== _project || task.id !== expectedId) {
        const invalid = new Error("Invalid task format.");
        (invalid as unknown as { code: string }).code = "INVALID_TASK_FORMAT";
        throw invalid;
      }

      tasks.push(task);
    }

    return tasks;
  }
}
