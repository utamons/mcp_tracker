import type { Clock } from "../../infra/Clock.js";
import type { GitPort } from "../../git/GitPort.js";
import type { WorktreeGuard } from "../../git/WorktreeGuard.js";
import type { IdAllocator } from "../../tasks/IdAllocator.js";
import type { TaskStore } from "../../tasks/TaskStore.js";
import { stat, unlink } from "node:fs/promises";
import path from "node:path";

export type TasksCreateInput = {
  project: string;
  type: "user_story" | "bug";
  title: string;
  body?: string;
};

export type TaskView = {
  id: string;
  project: string;
  type: "user_story" | "bug";
  title: string;
  status: "backlog";
  created_at: string;
};

export type TasksCreateResponse =
  | { ok: true; data: TaskView }
  | { ok: false; error: { code: string; message: string; details?: object } };

export class TasksCreateTool {
  constructor(
    private readonly _worktreeGuard: WorktreeGuard,
    private readonly _idAllocator: IdAllocator,
    private readonly _taskStore: TaskStore,
    private readonly _clock: Clock,
    private readonly _git: GitPort,
  ) {}

  async execute(_input: TasksCreateInput): Promise<TasksCreateResponse> {
    if (!isValidProjectName(_input.project)) {
      return {
        ok: false,
        error: {
          code: "INVALID_PROJECT_NAME",
          message: "Invalid project name.",
        },
      };
    }

    const projectExists = await existsAsDirectory(
      this._taskStore,
      _input.project,
    );
    if (!projectExists) {
      return {
        ok: false,
        error: { code: "PROJECT_NOT_FOUND", message: "Project not found." },
      };
    }

    try {
      await this._worktreeGuard.assertClean();
    } catch (error) {
      const code =
        error instanceof Error
          ? (error as unknown as { code?: string }).code
          : undefined;

      if (code === "GIT_DIRTY_WORKTREE") {
        return {
          ok: false,
          error: { code: "GIT_DIRTY_WORKTREE", message: error.message },
        };
      }

      return {
        ok: false,
        error: {
          code: "GIT_OPERATION_FAILED",
          message: "Failed to check git worktree state.",
        },
      };
    }

    const id = await this._idAllocator.nextId(_input.project);
    const created_at = this._clock.nowIsoWithOffset();
    const status: "backlog" = "backlog";

    const task = {
      id,
      project: _input.project,
      type: _input.type,
      title: _input.title,
      status,
      created_at,
      body: _input.body,
    } as const;

    const taskPath = this._taskStore.taskPath(_input.project, id);

    try {
      await this._taskStore.write(task);
      await this._git.commitAll(`create ${id}`);
    } catch {
      try {
        await unlink(taskPath);
      } catch {
        // ignore
      }

      return {
        ok: false,
        error: {
          code: "IO_ERROR",
          message: "Failed to create task.",
        },
      };
    }

    return {
      ok: true,
      data: {
        id,
        project: _input.project,
        type: _input.type,
        title: _input.title,
        status,
        created_at,
      },
    };
  }
}

function isValidProjectName(name: string): boolean {
  return /^[a-z0-9-]+$/.test(name);
}

async function existsAsDirectory(
  store: TaskStore,
  project: string,
): Promise<boolean> {
  const projectDir = path.dirname(store.taskPath(project, "__probe__"));
  try {
    const info = await stat(projectDir);
    return info.isDirectory();
  } catch {
    return false;
  }
}
