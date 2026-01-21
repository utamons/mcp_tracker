import type { GitPort } from "../../git/GitPort.js";
import type { WorktreeGuard } from "../../git/WorktreeGuard.js";
import type { TaskStatusTransitions } from "../../tasks/TaskStatusTransitions.js";
import type { TaskStore } from "../../tasks/TaskStore.js";
import type { WorkflowRules } from "../../tasks/WorkflowRules.js";

export type TasksPromoteToTodoInput = {
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
};

export type TasksPromoteToTodoResponse =
  | { ok: true; data: TaskView }
  | { ok: false; error: { code: string; message: string; details?: object } };

export class TasksPromoteToTodoTool {
  constructor(
    private readonly _worktreeGuard: WorktreeGuard,
    private readonly _taskStore: TaskStore,
    private readonly _rules: WorkflowRules,
    private readonly _transitions: TaskStatusTransitions,
    private readonly _git: GitPort,
  ) {}

  async execute(_input: TasksPromoteToTodoInput): Promise<TasksPromoteToTodoResponse> {
    return {
      ok: false,
      error: { code: "NOT_IMPLEMENTED", message: "Not implemented." },
    };
  }
}

