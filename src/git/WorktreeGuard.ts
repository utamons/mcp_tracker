import type { Config } from "../config/Config.js";

export class WorktreeGuard {
  constructor(private readonly _config: Config) {}

  async assertClean(): Promise<void> {
    throw new Error("Not implemented");
  }
}

