import type { Config } from "../config/Config.js";

export class TaskTemplateStore {
  constructor(private readonly _config: Config) {
    void this._config;
  }

  async read(_project: string): Promise<string> {
    void _project;
    throw new Error("Not implemented");
  }
}
