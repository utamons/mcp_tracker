import type { TaskEntity } from "./TaskStore.js";

export type Violation = {
  code: string;
  message: string;
  details?: object;
};

export class TaskValidator {
  validate(_task: TaskEntity, _fileNameId?: string): Violation[] {
    void _task;
    void _fileNameId;
    return [{ code: "NOT_IMPLEMENTED", message: "Not implemented." }];
  }
}

