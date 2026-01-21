import type { ProjectRegistry } from "../../projects/ProjectRegistry.js";

export type ProjectsListResponse =
  | { ok: true; data: { projects: string[] } }
  | { ok: false; error: { code: string; message: string } };

export class ProjectsListTool {
  constructor(private readonly registry: ProjectRegistry) {}

  async execute(): Promise<ProjectsListResponse> {
    try {
      const projects = await this.registry.list();
      return { ok: true, data: { projects } };
    } catch {
      return {
        ok: false,
        error: { code: "IO_ERROR", message: "Failed to read tasks root." },
      };
    }
  }
}
