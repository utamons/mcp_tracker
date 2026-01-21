import type { TaskEntity } from "./TaskStore.js";

export type TaskPatch = {
  type?: TaskEntity["type"];
  title?: string;
  body?: string;
};

export class TaskPatcher {
  apply(_task: TaskEntity, _patch: TaskPatch): TaskEntity {
    throw new Error("Not implemented");
  }
}

