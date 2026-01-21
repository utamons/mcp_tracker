import type { GitPort } from "../../git/GitPort.js";
import type { WorktreeGuard } from "../../git/WorktreeGuard.js";
import type { TaskStore } from "../../tasks/TaskStore.js";
import type { TaskPatcher, TaskPatch } from "../../tasks/TaskPatcher.js";
import type { WorkflowRules } from "../../tasks/WorkflowRules.js";

export type TasksUpdateInput = {
  project: string;
  id: string;
  patch: TaskPatch;
};

export type TasksUpdateResponse =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string; details?: object } };

export class TasksUpdateTool {
  constructor(
    _worktreeGuard: WorktreeGuard,
    _taskStore: TaskStore,
    _rules: WorkflowRules,
    _patcher: TaskPatcher,
    _git: GitPort,
  ) {}

  async execute(_input: TasksUpdateInput): Promise<TasksUpdateResponse> {
    return {
      ok: false,
      error: { code: "NOT_IMPLEMENTED", message: "Not implemented." },
    };
  }
}

