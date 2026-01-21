import type { TaskEntity } from "./TaskStore.js";

export class TaskStatusTransitions {
  toTodo(task: TaskEntity): TaskEntity {
    return { ...task, status: "todo" };
  }
}
