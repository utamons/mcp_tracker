import type { GitPort } from "../../git/GitPort.js";
import type { WorktreeGuard } from "../../git/WorktreeGuard.js";
import type { Clock } from "../../infra/Clock.js";
import type { TaskStatusTransitions } from "../../tasks/TaskStatusTransitions.js";
import type { TaskStore } from "../../tasks/TaskStore.js";
import type { WorkflowRules } from "../../tasks/WorkflowRules.js";

export type TasksCancelInput = {
  project: string;
  id: string;
};

export type TaskView = {
  id: string;
  project: string;
  type: "user_story" | "bug";
  title: string;
  status: "backlog" | "todo" | "in_progress" | "done" | "canceled";
  created_at: string;
  started_at?: string;
  tool?: string;
  canceled_at?: string;
};

export type TasksCancelResponse =
  | { ok: true; data: TaskView }
  | { ok: false; error: { code: string; message: string; details?: object } };

export class TasksCancelTool {
  constructor(
    _worktreeGuard: WorktreeGuard,
    _taskStore: TaskStore,
    _rules: WorkflowRules,
    _transitions: TaskStatusTransitions,
    _clock: Clock,
    _git: GitPort,
  ) {}

  async execute(_input: TasksCancelInput): Promise<TasksCancelResponse> {
    return {
      ok: false,
      error: { code: "NOT_IMPLEMENTED", message: "Not implemented." },
    };
  }
}

