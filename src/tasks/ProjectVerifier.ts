import type { TaskStore } from "./TaskStore.js";
import type { ProjectRegistry } from "../projects/ProjectRegistry.js";
import type { Violation } from "./TaskValidator.js";

export class ProjectVerifier {
  constructor(
    private readonly _projects: ProjectRegistry,
    private readonly _store: TaskStore,
  ) {}

  async verify(_project: string): Promise<Violation[]> {
    void _project;
    return [{ code: "NOT_IMPLEMENTED", message: "Not implemented." }];
  }
}

