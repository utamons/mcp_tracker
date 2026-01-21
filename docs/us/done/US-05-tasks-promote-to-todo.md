### ID: US-5 — Перевести backlog → todo

#### Цель
- Пользователь может “подготовить” задачу и пометить её готовой к взятию агентом.

#### Описание
- Реализовать инструмент `tasks.promote_to_todo(project, id)`.
- Разрешать переход статуса только `backlog → todo`.
- Перед изменением проверять чистоту Git; при успехе — отдельный commit и возврат актуального представления задачи.

#### Дизайн
- Классы/модули:
  - `TaskStore` (`src/tasks/TaskStore.ts`) — методы: `read(project: string, id: string): Promise<TaskEntity>`, `write(task: TaskEntity): Promise<void>`
  - `WorkflowRules` (`src/tasks/WorkflowRules.ts`) — методы: `assertTransition(task: TaskEntity, toStatus: TaskStatus): void`
  - `TaskStatusTransitions` (`src/tasks/TaskStatusTransitions.ts`) — методы: `toTodo(task: TaskEntity): TaskEntity`
  - `WorktreeGuard` (`src/git/WorktreeGuard.ts`) — методы: `assertClean(): Promise<void>`
  - `GitPort` (`src/git/GitPort.ts`) — методы: `commitAll(message: string): Promise<void>`
  - `TasksPromoteToTodoTool` (`src/mcp/tools/TasksPromoteToTodoTool.ts`) — методы: `execute(input): Promise<{ ok: true; data: TaskView }>`

#### Ссылки
- `docs/SPEC.md:71`
- `docs/SPEC.md:104`
- `docs/SPEC.md:106`
- `docs/SPEC.md:131`
- `docs/SPEC.md:306`
- `docs/SPEC.md:310`
- `docs/SPEC.md:311`
- `docs/SPEC.md:167`

#### Тесты (TDD)
- `[PromoteToTodo_backlogToTodo — переводит status backlog→todo и создаёт commit.]`
- `[PromoteToTodo_invalidTransition — при status≠backlog возвращает INVALID_STATUS_TRANSITION.]`
- `[PromoteToTodo_requiresCleanWorktree — при грязном worktree возвращает GIT_DIRTY_WORKTREE.]`
- `[PromoteToTodo_doesNotChangeBody — не меняет body/пользовательское содержимое задачи.]`

#### AC
- Given `status=backlog` и рабочее дерево Git чистое, When `tasks.promote_to_todo`, Then `status=todo` и создан commit.
- Given `status≠backlog`, Then ошибка `INVALID_STATUS_TRANSITION`.
- And MCP-инструмент `tasks.promote_to_todo` зарегистрирован в MCP-сервере (виден в `tools/list`), имеет `inputSchema` с параметрами из описания, и при вызове выполняет реальную операцию (не возвращает `error.code=NOT_IMPLEMENTED`).

#### DoD
- Тесты для promote зелёные.
- Переход статуса соответствует списку допустимых переходов.
- Ошибки не оставляют репозиторий в полуизменённом состоянии.
