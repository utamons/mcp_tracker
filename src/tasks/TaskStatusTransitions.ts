import type { TaskEntity } from "./TaskStore.js";

export class TaskStatusTransitions {
  toTodo(task: TaskEntity): TaskEntity {
    return { ...task, status: "todo" };
  }

  toInProgress(
    task: TaskEntity,
    meta: { startedAt: string; tool?: string },
  ): TaskEntity {
    return {
      ...task,
      status: "in_progress",
      started_at: meta.startedAt,
      tool: meta.tool,
      done_at: undefined,
      canceled_at: undefined,
    };
  }

  toDone(task: TaskEntity, meta: { doneAt: string }): TaskEntity {
    return {
      ...task,
      status: "done",
      done_at: meta.doneAt,
      canceled_at: undefined,
    };
  }

  toTodoReleased(task: TaskEntity): TaskEntity {
    return {
      ...task,
      status: "todo",
      started_at: undefined,
      tool: undefined,
      done_at: undefined,
      canceled_at: undefined,
    };
  }

  toCanceled(task: TaskEntity, meta: { canceledAt: string }): TaskEntity {
    return {
      ...task,
      status: "canceled",
      canceled_at: meta.canceledAt,
      done_at: undefined,
    };
  }
}
