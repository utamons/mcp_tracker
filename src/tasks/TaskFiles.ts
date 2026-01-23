export const TASK_TEMPLATE_NAME = "TASK_TEMPLATE.md";

export function isTaskMarkdownFile(name: string): boolean {
  return name.endsWith(".md") && name !== TASK_TEMPLATE_NAME;
}
