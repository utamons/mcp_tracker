import type { Config } from "../config/Config.js";
import { readdir } from "node:fs/promises";
import path from "node:path";

export class IdAllocator {
  constructor(private readonly _config: Config) {}

  async nextId(_project: string): Promise<string> {
    const prefix = computePrefix(_project);
    const repoRoot = this._config.getRepoRoot();
    const projectDir = path.join(repoRoot, _project);

    const entries = await readdir(projectDir, { withFileTypes: true });

    let max = 0;
    const pattern = new RegExp(`^${prefix}-(\\d{3})\\.md$`);
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const match = entry.name.match(pattern);
      if (!match) continue;

      const num = Number(match[1]);
      if (Number.isFinite(num)) max = Math.max(max, num);
    }

    const next = max + 1;
    if (next > 999) {
      const error = new Error("Task id overflow.");
      (error as unknown as { code: string }).code = "ID_OVERFLOW";
      throw error;
    }

    return `${prefix}-${String(next).padStart(3, "0")}`;
  }
}

function computePrefix(project: string): string {
  const tokens = project.split(/[-_ ]+/).filter((token) => token.length > 0);
  if (tokens.length === 0) return "XX";

  if (tokens.length === 1) {
    return tokens[0].slice(0, 2).toUpperCase();
  }

  return (tokens[0][0] + tokens[1][0]).toUpperCase();
}
