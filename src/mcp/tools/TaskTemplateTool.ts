import type { TaskTemplateStore } from "../../tasks/TaskTemplateStore.js";

export type TaskTemplateInput = {
  project: string;
};

export type TaskTemplateResponse =
  | { ok: true; data: { template: string } }
  | { ok: false; error: { code: string; message: string; details?: object } };

export class TaskTemplateTool {
  constructor(private readonly _store: TaskTemplateStore) {}

  async execute(_input: TaskTemplateInput): Promise<TaskTemplateResponse> {
    void _input;
    return {
      ok: false,
      error: { code: "NOT_IMPLEMENTED", message: "Not implemented." },
    };
  }
}
