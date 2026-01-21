import type { GitPort } from "./GitPort.js";
import type { WorktreeGuard } from "./WorktreeGuard.js";
import type { TaskStore } from "../tasks/TaskStore.js";

export type TaskView = {
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
};

export class RollbackService {
  constructor(
    private readonly _worktreeGuard: WorktreeGuard,
    private readonly _store: TaskStore,
    private readonly _git: GitPort,
  ) {}

  async rollbackTask(_project: string, _id: string, _revision: string): Promise<TaskView> {
    void _project;
    void _id;
    void _revision;
    throw new Error("Not implemented");
  }
}

