export const TASK_TEMPLATE_SUFFIX = "_TEMPLATE.md";

export function isTaskMarkdownFile(name: string): boolean {
  return name.endsWith(".md") && !name.endsWith(TASK_TEMPLATE_SUFFIX);
}

export function templateFileName(type: string): string {
  return `${type.toUpperCase()}${TASK_TEMPLATE_SUFFIX}`;
}
