export type TasksListResult =
  | { ok: true; output: string }
  | { ok: false; error: { code: string; message: string } };

export async function buildTasksList(_input: {
  project: string;
  repoRoot?: string;
}): Promise<TasksListResult> {
  return {
    ok: false,
    error: { code: "NOT_IMPLEMENTED", message: "Not implemented." },
  };
}
