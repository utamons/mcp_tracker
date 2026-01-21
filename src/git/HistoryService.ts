import type { GitCommit, GitPort } from "./GitPort.js";
import type { TaskStore } from "../tasks/TaskStore.js";
import { stat } from "node:fs/promises";
import path from "node:path";

export class HistoryService {
  constructor(
    private readonly _store: TaskStore,
    private readonly _git: GitPort,
  ) {}

  async getTaskHistory(_project: string, _id: string): Promise<GitCommit[]> {
    const projectDir = path.dirname(this._store.taskPath(_project, "__probe__"));
    try {
      const info = await stat(projectDir);
      if (!info.isDirectory()) {
        const notFound = new Error("Project not found.");
        (notFound as unknown as { code: string }).code = "PROJECT_NOT_FOUND";
        throw notFound;
      }
    } catch (error) {
      const code =
        error instanceof Error
          ? (error as unknown as { code?: string }).code
          : undefined;
      if (code === "PROJECT_NOT_FOUND") throw error;

      const fsCode =
        error instanceof Error
          ? (error as unknown as { code?: string }).code
          : undefined;
      if (fsCode === "ENOENT") {
        const notFound = new Error("Project not found.");
        (notFound as unknown as { code: string }).code = "PROJECT_NOT_FOUND";
        throw notFound;
      }
    }

    const filePath = this._store.taskPath(_project, _id);
    try {
      const info = await stat(filePath);
      if (!info.isFile()) {
        const notFound = new Error("Task not found.");
        (notFound as unknown as { code: string }).code = "TASK_NOT_FOUND";
        throw notFound;
      }
    } catch (error) {
      const fsCode =
        error instanceof Error
          ? (error as unknown as { code?: string }).code
          : undefined;
      if (fsCode === "ENOENT") {
        const notFound = new Error("Task not found.");
        (notFound as unknown as { code: string }).code = "TASK_NOT_FOUND";
        throw notFound;
      }

      const notFound = new Error("Task not found.");
      (notFound as unknown as { code: string }).code = "TASK_NOT_FOUND";
      throw notFound;
    }

    return this._git.log(filePath);
  }
}
