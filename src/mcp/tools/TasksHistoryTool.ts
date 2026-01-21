import type { GitCommit } from "../../git/GitPort.js";
import type { HistoryService } from "../../git/HistoryService.js";

export type TasksHistoryInput = {
  project: string;
  id: string;
};

export type TasksHistoryResponse =
  | { ok: true; data: { commits: GitCommit[] } }
  | { ok: false; error: { code: string; message: string; details?: object } };

export class TasksHistoryTool {
  constructor(private readonly _service: HistoryService) {}

  async execute(_input: TasksHistoryInput): Promise<TasksHistoryResponse> {
    void _input;
    return {
      ok: false,
      error: { code: "NOT_IMPLEMENTED", message: "Not implemented." },
    };
  }
}

