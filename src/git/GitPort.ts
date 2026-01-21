import type { Config } from "../config/Config.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class GitPort {
  constructor(private readonly _config: Config) {}

  async commitAll(_message: string): Promise<void> {
    const repoRoot = this._config.getRepoRoot();

    await execFileAsync("git", ["add", "-A"], { cwd: repoRoot });
    await execFileAsync("git", ["commit", "-m", _message], { cwd: repoRoot });
  }
}
