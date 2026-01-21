import type { TaskEntity } from "./TaskStore.js";

export class WorkflowRules {
  assertTransition(task: TaskEntity, toStatus: TaskEntity["status"]): void {
    const allowed: Record<TaskEntity["status"], TaskEntity["status"][]> = {
      backlog: ["todo", "canceled"],
      todo: ["in_progress", "canceled"],
      in_progress: ["done", "todo", "canceled"],
      done: [],
      canceled: [],
    };

    const fromStatus = task.status;
    const ok = allowed[fromStatus]?.includes(toStatus) ?? false;
    if (ok) return;

    const error = new Error("Invalid status transition.");
    (error as unknown as { code: string }).code = "INVALID_STATUS_TRANSITION";
    throw error;
  }

  assertCanUpdate(task: TaskEntity): void {
    if (task.status === "backlog") return;

    const error = new Error("Update is forbidden in this status.");
    (error as unknown as { code: string }).code = "FORBIDDEN_UPDATE_IN_STATUS";
    throw error;
  }
}
