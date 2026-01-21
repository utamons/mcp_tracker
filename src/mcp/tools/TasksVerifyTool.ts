import type { ProjectVerifier } from "../../tasks/ProjectVerifier.js";
import type { Violation } from "../../tasks/TaskValidator.js";

export type TasksVerifyInput = { project: string };

export type TasksVerifyResponse =
  | { ok: true; data: { violations: Violation[] } }
  | { ok: false; error: { code: string; message: string; details?: object } };

export class TasksVerifyTool {
  constructor(private readonly _verifier: ProjectVerifier) {}

  async execute(_input: TasksVerifyInput): Promise<TasksVerifyResponse> {
    void _input;
    return {
      ok: false,
      error: { code: "NOT_IMPLEMENTED", message: "Not implemented." },
    };
  }
}

