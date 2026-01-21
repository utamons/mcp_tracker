import type { TaskStore } from "../tasks/TaskStore.js";
import { TimeRange } from "./TimeRange.js";

export type ReportView = {
  done_count: number;
  remaining_count: number;
};

export class ReportService {
  constructor(private readonly _store: TaskStore) {}

  async build(_project: string, _fromIso: string, _toIso: string): Promise<ReportView> {
    const range = TimeRange.parse(_fromIso, _toIso);
    const tasks = await this._store.list(_project);

    let doneCount = 0;
    let remainingCount = 0;

    for (const task of tasks) {
      if (task.status === "done") {
        if (typeof task.done_at !== "string" || task.done_at === "") {
          const error = new Error("Invalid task format.");
          (error as unknown as { code: string }).code = "INVALID_TASK_FORMAT";
          throw error;
        }

        if (range.contains(task.done_at)) doneCount += 1;
        continue;
      }

      if (task.status !== "canceled") {
        remainingCount += 1;
      }
    }

    return { done_count: doneCount, remaining_count: remainingCount };
  }
}
