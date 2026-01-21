import type { ReportService, ReportView } from "../../report/ReportService.js";

export type TasksReportInput = {
  project: string;
  from: string;
  to: string;
};

export type TasksReportResponse =
  | { ok: true; data: ReportView }
  | { ok: false; error: { code: string; message: string; details?: object } };

export class TasksReportTool {
  constructor(private readonly _service: ReportService) {}

  async execute(_input: TasksReportInput): Promise<TasksReportResponse> {
    if (!isValidProjectName(_input.project)) {
      return {
        ok: false,
        error: { code: "INVALID_PROJECT_NAME", message: "Invalid project name." },
      };
    }
    if (typeof _input.from !== "string" || typeof _input.to !== "string") {
      return {
        ok: false,
        error: { code: "INVALID_TASK_FORMAT", message: "Invalid time range." },
      };
    }

    try {
      const report = await this._service.build(_input.project, _input.from, _input.to);
      return { ok: true, data: report };
    } catch (error) {
      const code =
        error instanceof Error
          ? (error as unknown as { code?: string }).code
          : undefined;

      if (code === "PROJECT_NOT_FOUND") {
        return { ok: false, error: { code, message: "Project not found." } };
      }
      if (code === "INVALID_TASK_FORMAT") {
        return { ok: false, error: { code, message: "Invalid task format." } };
      }
      if (code === "IO_ERROR") {
        return { ok: false, error: { code, message: "Failed to build report." } };
      }

      return { ok: false, error: { code: "IO_ERROR", message: "Failed to build report." } };
    }
  }
}

function isValidProjectName(name: string): boolean {
  return /^[a-z0-9-]+$/.test(name);
}
