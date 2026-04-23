import type { TaskStore, TaskEntity } from "./TaskStore.js";
import type { TaskTextSearch } from "./TaskTextSearch.js";
import type { TaskType } from "./TaskType.js";

export type TaskView = {
  id: string;
  project: string;
  type: TaskType;
  title: string;
  status: "backlog" | "todo" | "in_progress" | "done" | "canceled";
  created_at: string;
};

export class TaskQueryService {
  constructor(
    private readonly _store: TaskStore,
    private readonly _textSearch: TaskTextSearch,
  ) {}

  async list(
    _project: string,
    _filter: { status?: TaskEntity["status"]; type?: TaskEntity["type"]; text?: string },
  ): Promise<TaskView[]> {
    let tasks = await this._store.list(_project);

    if (_filter.status) {
      tasks = tasks.filter((task) => task.status === _filter.status);
    }

    if (_filter.type) {
      tasks = tasks.filter((task) => task.type === _filter.type);
    }

    if (typeof _filter.text === "string" && _filter.text.trim() !== "") {
      tasks = tasks.filter((task) => this._textSearch.matches(task, _filter.text!));
    }

    return tasks.map((task) => ({
      id: task.id,
      project: task.project,
      type: task.type,
      title: task.title,
      status: task.status,
      created_at: task.created_at,
    }));
  }
}
