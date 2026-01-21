### ID: US-7 — Агент берёт задачу (claim)

#### Цель
- Агент может взять задачу в работу; система фиксирует начало работы и запрещает дальнейшее редактирование содержимого.

#### Описание
- Реализовать инструмент `tasks.claim(project, id, tool?)`.
- Разрешать переход только `todo → in_progress`.
- При успехе выставлять `started_at` (локальное время сервера) и (опционально) `tool`.
- После claim редактирование body запрещено общими правилами редактирования (не в backlog).
- На каждую успешную операцию — отдельный Git commit.

#### Дизайн
- Классы/модули:
  - `TaskStore` (`src/tasks/TaskStore.ts`) — методы: `read(project: string, id: string): Promise<TaskEntity>`, `write(task: TaskEntity): Promise<void>`
  - `WorkflowRules` (`src/tasks/WorkflowRules.ts`) — методы: `assertTransition(task: TaskEntity, toStatus: TaskStatus): void`
  - `Clock` (`src/infra/Clock.ts`) — методы: `nowIsoWithOffset(): string`
  - `TaskStatusTransitions` (`src/tasks/TaskStatusTransitions.ts`) — методы: `toInProgress(task: TaskEntity, meta: { tool?: string; startedAt: string }): TaskEntity`
  - `WorktreeGuard` (`src/git/WorktreeGuard.ts`) — методы: `assertClean(): Promise<void>`
  - `GitPort` (`src/git/GitPort.ts`) — методы: `commitAll(message: string): Promise<void>`
  - `TasksClaimTool` (`src/mcp/tools/TasksClaimTool.ts`) — методы: `execute(input): Promise<{ ok: true; data: TaskView }>`

#### Ссылки
- `docs/SPEC.md:72`
- `docs/SPEC.md:64`
- `docs/SPEC.md:107`
- `docs/SPEC.md:118`
- `docs/SPEC.md:132`
- `docs/SPEC.md:321`
- `docs/SPEC.md:325`
- `docs/SPEC.md:328`

#### Тесты (TDD)
- `[Claim_todoToInProgress_setsStartedAt — переводит todo→in_progress и выставляет started_at.]`
- `[Claim_setsToolWhenProvided — сохраняет tool при передаче параметра tool.]`
- `[Claim_invalidTransition — при status≠todo возвращает INVALID_STATUS_TRANSITION.]`
- `[Claim_requiresCleanWorktree — при грязном worktree возвращает GIT_DIRTY_WORKTREE.]`
- `[Claim_commitsOnce — создаёт один commit на успешный claim.]`
- `[Claim_doesNotMutateBody — не меняет body и пользовательские поля, кроме системных.]`

#### AC
- Given `status=todo` и рабочее дерево Git чистое, When `tasks.claim`, Then `status=in_progress`.
- Then выставлен `started_at` (локальное время сервера), а редактирование body запрещено после claim.
- Then создан отдельный Git commit.
- Given `status≠todo`, Then ошибка `INVALID_STATUS_TRANSITION`.
- And MCP-инструмент `tasks.claim` зарегистрирован в MCP-сервере (виден в `tools/list`), имеет `inputSchema` с параметрами из описания, и при вызове выполняет реальную операцию (не возвращает `error.code=NOT_IMPLEMENTED`).

#### DoD
- Тесты для claim зелёные.
- started_at формируется в ISO-8601 с UTC-offset (локальное время сервера).
- Репозиторий остаётся консистентным при ошибках git/IO.
