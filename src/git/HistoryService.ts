import type { GitCommit, GitPort } from "./GitPort.js";
import type { TaskStore } from "../tasks/TaskStore.js";

export class HistoryService {
  constructor(
    private readonly _store: TaskStore,
    private readonly _git: GitPort,
  ) {}

  async getTaskHistory(_project: string, _id: string): Promise<GitCommit[]> {
    void _project;
    void _id;
    throw new Error("Not implemented");
  }
}

