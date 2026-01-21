import type { Config } from "../config/Config.js";
import type { Logger } from "../infra/Logger.js";
import { readdir } from "node:fs/promises";

export class ProjectRegistry {
  constructor(
    private readonly _config: Config,
    private readonly _logger: Logger,
  ) {}

  isValidName(name: string): boolean {
    return /^[a-z0-9-]+$/.test(name);
  }

  async list(): Promise<string[]> {
    const tasksRoot = this._config.getTasksRoot();
    const entries = await readdir(tasksRoot, { withFileTypes: true });

    const projects: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      if (this.isValidName(entry.name)) {
        projects.push(entry.name);
        continue;
      }

      this._logger.warn("Ignoring invalid project name.", { name: entry.name });
    }

    return projects.sort((left, right) => left.localeCompare(right));
  }
}
