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
    void _input;
    return {
      ok: false,
      error: { code: "NOT_IMPLEMENTED", message: "Not implemented." },
    };
  }
}

