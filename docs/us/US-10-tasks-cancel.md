### ID: US-10 — Отменить задачу (cancel)

#### Цель
- Пользователь/агент может отменить задачу в любом “не завершённом” статусе, с фиксацией времени отмены.

#### Описание
- Реализовать инструмент `tasks.cancel(project, id)`.
- Разрешать переходы `backlog → canceled`, `todo → canceled`, `in_progress → canceled`.
- При успехе выставлять `canceled_at` (локальное время сервера) и делать отдельный commit.
- Для отмены из `backlog/todo`: гарантировать, что поля `started_at/done_at/tool` отсутствуют (либо отклонять как `INVALID_TASK_FORMAT`).
- Для отмены из `in_progress`: сохранять `started_at` (и `tool`, если был), но `done_at` должен отсутствовать.

#### Дизайн
- Классы/модули:
  - `TaskStore` (`src/tasks/TaskStore.ts`) — методы: `read(project: string, id: string): Promise<TaskEntity>`, `write(task: TaskEntity): Promise<void>`
  - `WorkflowRules` (`src/tasks/WorkflowRules.ts`) — методы: `assertTransition(task: TaskEntity, toStatus: TaskStatus): void`, `assertForbiddenFields(task: TaskEntity): void`
  - `Clock` (`src/infra/Clock.ts`) — методы: `nowIsoWithOffset(): string`
  - `TaskStatusTransitions` (`src/tasks/TaskStatusTransitions.ts`) — методы: `toCanceled(task: TaskEntity, meta: { canceledAt: string }): TaskEntity`
  - `WorktreeGuard` (`src/git/WorktreeGuard.ts`) — методы: `assertClean(): Promise<void>`
  - `GitPort` (`src/git/GitPort.ts`) — методы: `commitAll(message: string): Promise<void>`
  - `TasksCancelTool` (`src/mcp/tools/TasksCancelTool.ts`) — методы: `execute(input): Promise<{ ok: true; data: TaskView }>`

#### Ссылки
- `docs/SPEC.md:75`
- `docs/SPEC.md:110`
- `docs/SPEC.md:112`
- `docs/SPEC.md:117`
- `docs/SPEC.md:120`
- `docs/SPEC.md:135`
- `docs/SPEC.md:344`
- `docs/SPEC.md:348`

#### Тесты (TDD)
- `[Cancel_fromBacklog_setsCanceledAt — backlog→canceled выставляет canceled_at и создаёт commit.]`
- `[Cancel_fromTodo_setsCanceledAt — todo→canceled выставляет canceled_at и создаёт commit.]`
- `[Cancel_fromInProgress_keepsStartedAt — in_progress→canceled сохраняет started_at и выставляет canceled_at.]`
- `[Cancel_invalidTransition — при status=done возвращает INVALID_STATUS_TRANSITION.]`
- `[Cancel_requiresCleanWorktree — при грязном worktree возвращает GIT_DIRTY_WORKTREE.]`
- `[Cancel_invalidFieldsInBacklogTodo — при наличии started_at/tool/done_at в backlog/todo возвращает INVALID_TASK_FORMAT.]`

#### AC
- Given `status∈{backlog,todo}` и рабочее дерево Git чистое, When `tasks.cancel`, Then `status=canceled` и выставлен `canceled_at`.
- Given `status=in_progress` и рабочее дерево Git чистое, When `tasks.cancel`, Then `status=canceled` и выставлен `canceled_at`.
- Then при успехе создан отдельный Git commit.
- And MCP-инструмент `tasks.cancel` зарегистрирован в MCP-сервере (виден в `tools/list`), имеет `inputSchema` с параметрами из описания, и при вызове выполняет реальную операцию (не возвращает `error.code=NOT_IMPLEMENTED`).

#### DoD
- Тесты для cancel зелёные.
- canceled_at соответствует ISO-8601 с UTC-offset.
- Переходы статусов соответствуют списку допустимых переходов.
