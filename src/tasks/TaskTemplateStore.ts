import type { Config } from "../config/Config.js";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { templateFileName } from "./TaskFiles.js";

export class TaskTemplateStore {
  constructor(private readonly _config: Config) {}

  async read(_project: string, _type: string): Promise<string> {
    const projectDir = path.join(this._config.getRepoRoot(), _project);
    try {
      const info = await stat(projectDir);
      if (!info.isDirectory()) {
        const notFound = new Error("Project not found.");
        (notFound as unknown as { code: string }).code = "PROJECT_NOT_FOUND";
        throw notFound;
      }
    } catch (error) {
      const code =
        error instanceof Error
          ? (error as unknown as { code?: string }).code
          : undefined;

      if (code === "ENOENT" || code === "PROJECT_NOT_FOUND") {
        const notFound = new Error("Project not found.");
        (notFound as unknown as { code: string }).code = "PROJECT_NOT_FOUND";
        throw notFound;
      }

      const io = new Error("Failed to read task template.");
      (io as unknown as { code: string }).code = "IO_ERROR";
      throw io;
    }

    const templatePath = path.join(projectDir, templateFileName(_type));
    try {
      return await readFile(templatePath, "utf8");
    } catch (error) {
      const code =
        error instanceof Error
          ? (error as unknown as { code?: string }).code
          : undefined;

      if (code === "ENOENT") {
        const notFound = new Error("Task template not found.");
        (notFound as unknown as { code: string }).code = "TASK_TEMPLATE_NOT_FOUND";
        throw notFound;
      }

      const io = new Error("Failed to read task template.");
      (io as unknown as { code: string }).code = "IO_ERROR";
      throw io;
    }
  }
}
