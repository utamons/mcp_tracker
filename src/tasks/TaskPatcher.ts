import type { TaskEntity } from "./TaskStore.js";

export type TaskPatch = {
  type?: TaskEntity["type"];
  title?: string;
  body?: string;
};

export class TaskPatcher {
  apply(task: TaskEntity, patch: TaskPatch): TaskEntity {
    if (typeof patch !== "object" || patch === null) {
      const error = new Error("Invalid patch format.");
      (error as unknown as { code: string }).code = "INVALID_TASK_FORMAT";
      throw error;
    }

    const next: TaskEntity = { ...task };

    if (patch.type !== undefined) {
      if (patch.type !== "user_story" && patch.type !== "bug") {
        const error = new Error("Invalid task type.");
        (error as unknown as { code: string }).code = "INVALID_TASK_FORMAT";
        throw error;
      }
      next.type = patch.type;
    }

    if (patch.title !== undefined) {
      if (typeof patch.title !== "string" || patch.title.trim() === "") {
        const error = new Error("Invalid task title.");
        (error as unknown as { code: string }).code = "INVALID_TASK_FORMAT";
        throw error;
      }
      next.title = patch.title;
    }

    if (patch.body !== undefined) {
      if (typeof patch.body !== "string") {
        const error = new Error("Invalid task body.");
        (error as unknown as { code: string }).code = "INVALID_TASK_FORMAT";
        throw error;
      }
      next.body = patch.body === "" ? undefined : patch.body;
    }

    return next;
  }
}
