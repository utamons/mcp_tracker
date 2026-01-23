import type { TaskStore } from "./TaskStore.js";
import type { ProjectRegistry } from "../projects/ProjectRegistry.js";
import type { Violation } from "./TaskValidator.js";
import { TaskValidator } from "./TaskValidator.js";
import { parseTask } from "./TaskParser.js";
import { isTaskMarkdownFile } from "./TaskFiles.js";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export class ProjectVerifier {
  constructor(
    private readonly _projects: ProjectRegistry,
    private readonly _store: TaskStore,
  ) {}

  async verify(_project: string): Promise<Violation[]> {
    const violations: Violation[] = [];

    if (!this._projects.isValidName(_project)) {
      violations.push({
        code: "INVALID_PROJECT_NAME",
        message: "Invalid project name.",
        details: { project: _project },
      });
    }

    const projectDir = this._store.projectDirPath(_project);

    let entries;
    try {
      entries = await readdir(projectDir, { withFileTypes: true });
    } catch (error) {
      const code =
        error instanceof Error
          ? (error as unknown as { code?: string }).code
          : undefined;

      if (code === "ENOENT") {
        const notFound = new Error("Project not found.");
        (notFound as unknown as { code: string }).code = "PROJECT_NOT_FOUND";
        throw notFound;
      }

      const io = new Error("Failed to read project.");
      (io as unknown as { code: string }).code = "IO_ERROR";
      throw io;
    }

    const files = entries
      .filter((e) => e.isFile() && isTaskMarkdownFile(e.name))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b));

    const validator = new TaskValidator();
    const seenIds: string[] = [];

    for (const file of files) {
      const fileNameId = file.slice(0, -".md".length);
      const filePath = path.join(projectDir, file);

      let content: string;
      try {
        content = await readFile(filePath, "utf8");
      } catch {
        const io = new Error("Failed to read task.");
        (io as unknown as { code: string }).code = "IO_ERROR";
        throw io;
      }

      let task;
      try {
        task = parseTask(content);
      } catch {
        violations.push({
          code: "INVALID_TASK_FORMAT",
          message: "Invalid task format.",
          details: { file },
        });
        continue;
      }

      if (task.project !== _project) {
        violations.push({
          code: "INVALID_TASK_FORMAT",
          message: "Task project mismatch.",
          details: { file, task_project: task.project, project: _project },
        });
      }

      violations.push(...validator.validate(task, fileNameId));
      seenIds.push(task.id);
    }

    violations.push(...this.checkUniqueIds(seenIds));
    return violations;
  }

  checkUniqueIds(ids: string[]): Violation[] {
    const counts = new Map<string, number>();
    for (const id of ids) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }

    const violations: Violation[] = [];
    for (const [id, count] of counts.entries()) {
      if (count <= 1) continue;
      violations.push({
        code: "DUPLICATE_TASK_ID",
        message: "Duplicate task id.",
        details: { id, count },
      });
    }

    return violations;
  }
}
