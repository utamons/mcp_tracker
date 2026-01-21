import type { Config } from "../config/Config.js";

export class IdAllocator {
  constructor(private readonly _config: Config) {}

  async nextId(_project: string): Promise<string> {
    throw new Error("Not implemented");
  }
}

