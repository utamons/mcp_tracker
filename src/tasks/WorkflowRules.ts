import type { TaskEntity } from "./TaskStore.js";

export class WorkflowRules {
  assertCanUpdate(_task: TaskEntity): void {
    throw new Error("Not implemented");
  }
}

