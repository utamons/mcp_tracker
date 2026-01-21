import type { Config } from "../config/Config.js";
import type { Logger } from "../infra/Logger.js";

export class ProjectRegistry {
  constructor(
    private readonly _config: Config,
    private readonly _logger: Logger,
  ) {}

  isValidName(name: string): boolean {
    return /^[a-z0-9-]+$/.test(name);
  }

  async list(): Promise<string[]> {
    return [];
  }
}

