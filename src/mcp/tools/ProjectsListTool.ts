import type { ProjectRegistry } from "../../projects/ProjectRegistry.js";

export type ProjectsListResponse =
  | { ok: true; data: { projects: string[] } }
  | { ok: false; error: { code: string; message: string } };

export class ProjectsListTool {
  constructor(private readonly _registry: ProjectRegistry) {}

  async execute(): Promise<ProjectsListResponse> {
    return { ok: true, data: { projects: [] } };
  }
}

