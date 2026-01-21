export class Config {
  constructor(
    private readonly repoRoot: string,
    private readonly tasksRoot: string,
  ) {}

  getRepoRoot(): string {
    return this.repoRoot;
  }

  getTasksRoot(): string {
    return this.tasksRoot;
  }
}

