### ID: US-9 — Release/Unclaim

#### Цель
- Агент может освободить задачу, если работа остановлена/передаётся, чтобы другой агент мог взять её снова.

#### Описание
- Реализовать инструмент `tasks.release(project, id)`.
- Разрешать переход только `in_progress → todo`.
- При успехе очищать `started_at` и `tool`, делать отдельный commit и возвращать актуальное представление задачи.

#### Дизайн
- Классы/модули:
  - `TaskStore` (`src/tasks/TaskStore.ts`) — методы: `read(project: string, id: string): Promise<TaskEntity>`, `write(task: TaskEntity): Promise<void>`
  - `WorkflowRules` (`src/tasks/WorkflowRules.ts`) — методы: `assertTransition(task: TaskEntity, toStatus: TaskStatus): void`
  - `TaskStatusTransitions` (`src/tasks/TaskStatusTransitions.ts`) — методы: `toTodoReleased(task: TaskEntity): TaskEntity`
  - `WorktreeGuard` (`src/git/WorktreeGuard.ts`) — методы: `assertClean(): Promise<void>`
  - `GitPort` (`src/git/GitPort.ts`) — методы: `commitAll(message: string): Promise<void>`
  - `TasksReleaseTool` (`src/mcp/tools/TasksReleaseTool.ts`) — методы: `execute(input): Promise<{ ok: true; data: TaskView }>`

#### Ссылки
- `docs/SPEC.md:74`
- `docs/SPEC.md:109`
- `docs/SPEC.md:134`
- `docs/SPEC.md:337`
- `docs/SPEC.md:341`

#### Тесты (TDD)
- `[Release_inProgressToTodo_clearsFields — переводит in_progress→todo и очищает started_at/tool.]`
- `[Release_invalidTransition — при status≠in_progress возвращает INVALID_STATUS_TRANSITION.]`
- `[Release_requiresCleanWorktree — при грязном worktree возвращает GIT_DIRTY_WORKTREE.]`
- `[Release_commitsOnce — создаёт один commit на успешный release.]`

#### AC
- Given `status=in_progress` и рабочее дерево Git чистое, When `tasks.release`, Then `status=todo`.
- Then поля `started_at`, `tool` очищены и создан commit.
- And MCP-инструмент `tasks.release` зарегистрирован в MCP-сервере (виден в `tools/list`), имеет `inputSchema` с параметрами из описания, и при вызове выполняет реальную операцию (не возвращает `error.code=NOT_IMPLEMENTED`).

#### DoD
- Тесты для release зелёные.
- Очистка started_at/tool выполняется строго на успешном переходе.
- Ошибки не меняют файл задачи и не создают commit.
