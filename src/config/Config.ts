export class Config {
  constructor(
    private readonly repoRoot: string,
    _unusedTasksRoot?: string,
  ) {}

  getRepoRoot(): string {
    return this.repoRoot;
  }
}
