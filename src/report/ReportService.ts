import type { TaskStore } from "../tasks/TaskStore.js";

export type ReportView = {
  done_count: number;
  remaining_count: number;
};

export class ReportService {
  constructor(private readonly _store: TaskStore) {}

  async build(_project: string, _fromIso: string, _toIso: string): Promise<ReportView> {
    void _project;
    void _fromIso;
    void _toIso;
    throw new Error("Not implemented");
  }
}

