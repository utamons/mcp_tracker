import type { TaskStore, TaskEntity } from "./TaskStore.js";
import type { TaskTextSearch } from "./TaskTextSearch.js";

export type TaskView = {
  id: string;
  project: string;
  type: "user_story" | "bug";
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
    _filter: { status?: TaskEntity["status"]; text?: string },
  ): Promise<TaskView[]> {
    void this._store;
    void this._textSearch;
    return [];
  }
}

