export const TASK_TYPES = ["user_story", "bug", "review"] as const;

export type TaskType = (typeof TASK_TYPES)[number];

export function isValidTaskType(value: unknown): value is TaskType {
  return typeof value === "string" && TASK_TYPES.includes(value as TaskType);
}
