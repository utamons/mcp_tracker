import type { ProjectVerifier } from "../../tasks/ProjectVerifier.js";
import type { Violation } from "../../tasks/TaskValidator.js";

export type TasksVerifyInput = { project: string };

export type TasksVerifyResponse =
  | { ok: true; data: { violations: Violation[] } }
  | { ok: false; error: { code: string; message: string; details?: object } };

export class TasksVerifyTool {
  constructor(private readonly _verifier: ProjectVerifier) {}

  async execute(_input: TasksVerifyInput): Promise<TasksVerifyResponse> {
    if (typeof _input.project !== "string" || _input.project.trim() === "") {
      return {
        ok: false,
        error: { code: "INVALID_TASK_FORMAT", message: "Invalid project." },
      };
    }

    try {
      const violations = await this._verifier.verify(_input.project);
      return { ok: true, data: { violations } };
    } catch (error) {
      const code =
        error instanceof Error
          ? (error as unknown as { code?: string }).code
          : undefined;

      if (code === "PROJECT_NOT_FOUND") {
        return { ok: false, error: { code, message: "Project not found." } };
      }
      if (code === "IO_ERROR") {
        return { ok: false, error: { code, message: "Failed to verify tasks." } };
      }

      return { ok: false, error: { code: "IO_ERROR", message: "Failed to verify tasks." } };
    }
  }
}
