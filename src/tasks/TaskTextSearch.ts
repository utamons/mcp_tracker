import type { TaskEntity } from "./TaskStore.js";

export class TaskTextSearch {
  matches(_task: TaskEntity, _text: string): boolean {
    const query = String(_text ?? "").trim();
    if (query === "") return true;

    const haystackTitle = _task.title.toLowerCase();
    const haystackBody = (_task.body ?? "").toLowerCase();
    const needle = query.toLowerCase();

    return haystackTitle.includes(needle) || haystackBody.includes(needle);
  }
}
