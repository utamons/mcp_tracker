import type { TaskEntity } from "./TaskStore.js";

export type Violation = {
  code: string;
  message: string;
  details?: object;
};

export class TaskValidator {
  validate(_task: TaskEntity, _fileNameId?: string): Violation[] {
    const violations: Violation[] = [];

    if (typeof _fileNameId === "string" && _fileNameId !== "" && _task.id !== _fileNameId) {
      violations.push({
        code: "FILE_NAME_MISMATCH",
        message: "File name does not match task id.",
        details: { file_id: _fileNameId, task_id: _task.id },
      });
    }

    const timestampFields: Array<keyof Pick<
      TaskEntity,
      "created_at" | "started_at" | "done_at" | "canceled_at"
    >> = ["created_at", "started_at", "done_at", "canceled_at"];

    for (const field of timestampFields) {
      const value = _task[field];
      if (typeof value === "undefined") continue;
      if (!isValidIsoWithOffset(value)) {
        violations.push({
          code: "INVALID_TIMESTAMP",
          message: "Invalid timestamp.",
          details: { field, value },
        });
      }
    }

    if (_task.status === "backlog" || _task.status === "todo") {
      for (const field of ["started_at", "done_at", "canceled_at", "tool"] as const) {
        if (typeof _task[field] === "undefined") continue;
        violations.push({
          code: "FORBIDDEN_FIELD",
          message: "Forbidden field for this status.",
          details: { status: _task.status, field },
        });
      }
    }

    if (_task.status === "in_progress") {
      if (!isNonEmptyString(_task.started_at)) {
        violations.push({
          code: "MISSING_REQUIRED_FIELD",
          message: "Missing required field for this status.",
          details: { status: _task.status, field: "started_at" },
        });
      }

      for (const field of ["done_at", "canceled_at"] as const) {
        if (typeof _task[field] === "undefined") continue;
        violations.push({
          code: "FORBIDDEN_FIELD",
          message: "Forbidden field for this status.",
          details: { status: _task.status, field },
        });
      }
    }

    if (_task.status === "done") {
      if (!isNonEmptyString(_task.done_at)) {
        violations.push({
          code: "MISSING_REQUIRED_FIELD",
          message: "Missing required field for this status.",
          details: { status: _task.status, field: "done_at" },
        });
      }

      if (typeof _task.canceled_at !== "undefined") {
        violations.push({
          code: "FORBIDDEN_FIELD",
          message: "Forbidden field for this status.",
          details: { status: _task.status, field: "canceled_at" },
        });
      }
    }

    if (_task.status === "canceled") {
      if (!isNonEmptyString(_task.canceled_at)) {
        violations.push({
          code: "MISSING_REQUIRED_FIELD",
          message: "Missing required field for this status.",
          details: { status: _task.status, field: "canceled_at" },
        });
      }

      if (typeof _task.done_at !== "undefined") {
        violations.push({
          code: "FORBIDDEN_FIELD",
          message: "Forbidden field for this status.",
          details: { status: _task.status, field: "done_at" },
        });
      }
    }

    return violations;
  }
}

const ISO_WITH_OFFSET_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?[+-]\d{2}:\d{2}$/;

function isValidIsoWithOffset(value: string): boolean {
  if (!ISO_WITH_OFFSET_REGEX.test(value)) return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}
