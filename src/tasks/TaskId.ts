const TASK_ID_REGEX = /^[A-Za-z0-9]+-\d{3,}$/;

export function isValidTaskId(id: unknown): id is string {
  return typeof id === "string" && TASK_ID_REGEX.test(id);
}
