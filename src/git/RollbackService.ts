import type { GitPort } from "./GitPort.js";
import type { WorktreeGuard } from "./WorktreeGuard.js";
import type { TaskStore } from "../tasks/TaskStore.js";
import type { TaskType } from "../tasks/TaskType.js";
import { stat } from "node:fs/promises";
import path from "node:path";

export type TaskView = {
  id: string;
  project: string;
  type: TaskType;
  title: string;
  status: "backlog" | "todo" | "in_progress" | "done" | "canceled";
  created_at: string;
  started_at?: string;
  done_at?: string;
  canceled_at?: string;
  tool?: string;
};

export class RollbackService {
  constructor(
    private readonly _worktreeGuard: WorktreeGuard,
    private readonly _store: TaskStore,
    private readonly _git: GitPort,
  ) {}

  async rollbackTask(_project: string, _id: string, _revision: string): Promise<TaskView> {
    await this._worktreeGuard.assertClean();

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

    try {
      await this._git.restoreFileToRevision(filePath, _revision);
      await this._git.commitAll(`rollback ${_id} to ${_revision}`);
    } catch (error) {
      const code =
        error instanceof Error
          ? (error as unknown as { code?: string }).code
          : undefined;

      try {
        await this._git.restoreFileToRevision(filePath, "HEAD");
      } catch {
        // ignore
      }

      if (code === "GIT_OPERATION_FAILED") throw error;

      const gitError = new Error("Git operation failed.");
      (gitError as unknown as { code: string }).code = "GIT_OPERATION_FAILED";
      throw gitError;
    }

    const task = await this._store.read(_project, _id);

    return {
      id: task.id,
      project: task.project,
      type: task.type,
      title: task.title,
      status: task.status,
      created_at: task.created_at,
      started_at: task.started_at,
      done_at: task.done_at,
      canceled_at: task.canceled_at,
      tool: task.tool,
    };
  }
}
