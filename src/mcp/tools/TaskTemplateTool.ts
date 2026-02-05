import type { TaskTemplateStore } from "../../tasks/TaskTemplateStore.js";

export type TaskTemplateInput = {
  project: string;
  type: string;
};

export type TaskTemplateResponse =
  | { ok: true; data: { template: string } }
  | { ok: false; error: { code: string; message: string; details?: object } };

export class TaskTemplateTool {
  constructor(private readonly _store: TaskTemplateStore) {}

  async execute(_input: TaskTemplateInput): Promise<TaskTemplateResponse> {
    if (!isValidProjectName(_input.project)) {
      return {
        ok: false,
        error: { code: "INVALID_PROJECT_NAME", message: "Invalid project name." },
      };
    }
    if (!isValidTemplateType(_input.type)) {
      return {
        ok: false,
        error: { code: "INVALID_TEMPLATE_TYPE", message: "Invalid template type." },
      };
    }

    try {
      const template = await this._store.read(_input.project, _input.type);
      return { ok: true, data: { template } };
    } catch (error) {
      const code =
        error instanceof Error
          ? (error as unknown as { code?: string }).code
          : undefined;

      if (code === "PROJECT_NOT_FOUND") {
        return { ok: false, error: { code, message: "Project not found." } };
      }
      if (code === "TASK_TEMPLATE_NOT_FOUND") {
        return { ok: false, error: { code, message: "Task template not found." } };
      }
      if (code === "IO_ERROR") {
        return {
          ok: false,
          error: { code, message: "Failed to read task template." },
        };
      }

      return {
        ok: false,
        error: { code: "IO_ERROR", message: "Failed to read task template." },
      };
    }
  }
}

function isValidProjectName(name: string): boolean {
  return /^[a-z0-9-]+$/.test(name);
}

function isValidTemplateType(type: string): boolean {
  return /^[a-z0-9_-]+$/.test(type);
}
