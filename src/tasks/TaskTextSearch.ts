import type { TaskEntity } from "./TaskStore.js";

export class TaskTextSearch {
  matches(_task: TaskEntity, _text: string): boolean {
    return false;
  }
}

