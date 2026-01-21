### ID: US-8 — Агент завершает задачу (done)

#### Цель
- Агент может завершить задачу; система фиксирует время завершения для отчётности.

#### Описание
- Реализовать инструмент `tasks.done(project, id)`.
- Разрешать переход только `in_progress → done`.
- При успехе выставлять `done_at` (локальное время сервера) и делать отдельный commit.

#### Дизайн
- Классы/модули:
  - `TaskStore` (`src/tasks/TaskStore.ts`) — методы: `read(project: string, id: string): Promise<TaskEntity>`, `write(task: TaskEntity): Promise<void>`
  - `WorkflowRules` (`src/tasks/WorkflowRules.ts`) — методы: `assertTransition(task: TaskEntity, toStatus: TaskStatus): void`, `assertRequiredFields(task: TaskEntity): void`
  - `Clock` (`src/infra/Clock.ts`) — методы: `nowIsoWithOffset(): string`
  - `TaskStatusTransitions` (`src/tasks/TaskStatusTransitions.ts`) — методы: `toDone(task: TaskEntity, meta: { doneAt: string }): TaskEntity`
  - `WorktreeGuard` (`src/git/WorktreeGuard.ts`) — методы: `assertClean(): Promise<void>`
  - `GitPort` (`src/git/GitPort.ts`) — методы: `commitAll(message: string): Promise<void>`
  - `TasksDoneTool` (`src/mcp/tools/TasksDoneTool.ts`) — методы: `execute(input): Promise<{ ok: true; data: TaskView }>`

#### Ссылки
- `docs/SPEC.md:73`
- `docs/SPEC.md:65`
- `docs/SPEC.md:108`
- `docs/SPEC.md:119`
- `docs/SPEC.md:133`
- `docs/SPEC.md:330`
- `docs/SPEC.md:334`

#### Тесты (TDD)
- `[Done_inProgressToDone_setsDoneAt — переводит in_progress→done и выставляет done_at.]`
- `[Done_invalidTransition — при status≠in_progress возвращает INVALID_STATUS_TRANSITION.]`
- `[Done_requiresCleanWorktree — при грязном worktree возвращает GIT_DIRTY_WORKTREE.]`
- `[Done_commitsOnce — создаёт один commit на успешный done.]`

#### AC
- Given `status=in_progress` и рабочее дерево Git чистое, When `tasks.done`, Then `status=done` и выставлен `done_at` (локальное время сервера).
- Then создан отдельный Git commit.

#### DoD
- Тесты для done зелёные.
- done_at сохраняется в ISO-8601 с UTC-offset.
- Коммит создаётся на каждую успешную операцию.

