import type { Config } from "../config/Config.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class WorktreeGuard {
  constructor(private readonly _config: Config) {}

  async assertClean(): Promise<void> {
    const repoRoot = this._config.getRepoRoot();
    const { stdout } = await execFileAsync("git", ["status", "--porcelain"], {
      cwd: repoRoot,
    });

    if (stdout.toString().trim() === "") return;

    const error = new Error("Git worktree is dirty.");
    (error as unknown as { code: string }).code = "GIT_DIRTY_WORKTREE";
    throw error;
  }
}
