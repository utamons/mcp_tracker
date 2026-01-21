import type { Config } from "../config/Config.js";

export type TaskEntity = {
  id: string;
  project: string;
  type: "user_story" | "bug";
  title: string;
  status: "backlog" | "todo" | "in_progress" | "done" | "canceled";
  created_at: string;
  body?: string;
};

export class TaskStore {
  constructor(private readonly _config: Config) {}

  taskPath(_project: string, _id: string): string {
    throw new Error("Not implemented");
  }

  async write(_task: TaskEntity): Promise<void> {
    throw new Error("Not implemented");
  }
}

