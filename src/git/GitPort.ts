import type { Config } from "../config/Config.js";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type GitCommit = {
  hash: string;
  author: string;
  date: string;
  subject: string;
};

export class GitPort {
  constructor(private readonly _config: Config) {}

  async commitAll(_message: string): Promise<void> {
    const repoRoot = this._config.getRepoRoot();

    await execFileAsync("git", ["add", "-A"], { cwd: repoRoot });
    await execFileAsync("git", ["commit", "-m", _message], { cwd: repoRoot });
  }

  async log(_filePath: string): Promise<GitCommit[]> {
    const repoRoot = this._config.getRepoRoot();
    const relPath = path.relative(repoRoot, _filePath);

    try {
      const { stdout } = await execFileAsync(
        "git",
        [
          "log",
          "--date=iso-strict",
          "--pretty=format:%H%x1f%an%x1f%ad%x1f%s",
          "--",
          relPath,
        ],
        { cwd: repoRoot },
      );

      const out = stdout.toString().trim();
      if (out === "") return [];

      const commits: GitCommit[] = [];
      for (const line of out.split("\n")) {
        const [hash, author, date, subject] = line.split("\x1f");
        if (!hash || !author || !date || typeof subject === "undefined") continue;
        commits.push({ hash, author, date, subject });
      }

      return commits;
    } catch {
      const error = new Error("Git operation failed.");
      (error as unknown as { code: string }).code = "GIT_OPERATION_FAILED";
      throw error;
    }
  }

  async restoreFileToRevision(_filePath: string, _revision: string): Promise<void> {
    const repoRoot = this._config.getRepoRoot();
    const relPath = path.relative(repoRoot, _filePath);

    try {
      await execFileAsync(
        "git",
        ["restore", "--source", _revision, "--staged", "--worktree", "--", relPath],
        { cwd: repoRoot },
      );
    } catch {
      const error = new Error("Git operation failed.");
      (error as unknown as { code: string }).code = "GIT_OPERATION_FAILED";
      throw error;
    }
  }
}
