import type { Clock } from "../../infra/Clock.js";
import type { GitPort } from "../../git/GitPort.js";
import type { WorktreeGuard } from "../../git/WorktreeGuard.js";
import type { IdAllocator } from "../../tasks/IdAllocator.js";
import type { TaskStore } from "../../tasks/TaskStore.js";

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
    return {
      ok: false,
      error: { code: "NOT_IMPLEMENTED", message: "Not implemented." },
    };
  }
}

