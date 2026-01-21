import type { RollbackService, TaskView } from "../../git/RollbackService.js";

export type TasksRollbackInput = {
  project: string;
  id: string;
  revision: string;
};

export type TasksRollbackResponse =
  | { ok: true; data: TaskView }
  | { ok: false; error: { code: string; message: string; details?: object } };

export class TasksRollbackTool {
  constructor(private readonly _service: RollbackService) {}

  async execute(_input: TasksRollbackInput): Promise<TasksRollbackResponse> {
    void _input;
    return {
      ok: false,
      error: { code: "NOT_IMPLEMENTED", message: "Not implemented." },
    };
  }
}

