import type { Config } from "../config/Config.js";

export class GitPort {
  constructor(private readonly _config: Config) {}

  async commitAll(_message: string): Promise<void> {
    throw new Error("Not implemented");
  }
}

