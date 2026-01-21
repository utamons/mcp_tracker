import type { TaskEntity } from "./TaskStore.js";

export class TaskStatusTransitions {
  toTodo(_task: TaskEntity): TaskEntity {
    throw new Error("Not implemented");
  }
}

