import type { TaskEntity } from "./TaskStore.js";

export class WorkflowRules {
  assertCanUpdate(task: TaskEntity): void {
    if (task.status === "backlog") return;

    const error = new Error("Update is forbidden in this status.");
    (error as unknown as { code: string }).code = "FORBIDDEN_UPDATE_IN_STATUS";
    throw error;
  }
}
