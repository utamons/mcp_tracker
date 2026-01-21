### ID: US-13 — Откат

#### Цель
- Пользователь/агент может откатить задачу к выбранной ревизии через Git, не переписывая историю.

#### Описание
- Реализовать инструмент `tasks.rollback(project, id, revision)`.
- Перед операцией проверять чистоту рабочего дерева Git.
- Выполнять восстановление содержимого файла задачи к указанной ревизии через git restore/revert и создавать отдельный commit вида `rollback <ID> to <rev>`.
- Возвращать актуальное представление задачи после отката.

#### Дизайн
- Классы/модули:
  - `WorktreeGuard` (`src/git/WorktreeGuard.ts`) — методы: `assertClean(): Promise<void>`
  - `TaskStore` (`src/tasks/TaskStore.ts`) — методы: `taskPath(project: string, id: string): string`, `read(project: string, id: string): Promise<TaskEntity>`
  - `GitPort` (`src/git/GitPort.ts`) — методы: `restoreFileToRevision(filePath: string, revision: string): Promise<void>`, `commitAll(message: string): Promise<void>`
  - `RollbackService` (`src/git/RollbackService.ts`) — методы: `rollbackTask(project: string, id: string, revision: string): Promise<TaskView>`
  - `TasksRollbackTool` (`src/mcp/tools/TasksRollbackTool.ts`) — методы: `execute(input): Promise<{ ok: true; data: TaskView }>`

#### Ссылки
- `docs/SPEC.md:79`
- `docs/SPEC.md:139`
- `docs/SPEC.md:234`
- `docs/SPEC.md:248`
- `docs/SPEC.md:365`
- `docs/SPEC.md:369`

#### Тесты (TDD)
- `[Rollback_restoresFileAndCommits — восстанавливает файл к ревизии и создаёт новый commit.]`
- `[Rollback_requiresCleanWorktree — при грязном worktree возвращает GIT_DIRTY_WORKTREE.]`
- `[Rollback_invalidRevision — при неизвестной ревизии возвращает GIT_OPERATION_FAILED.]`
- `[Rollback_returnsUpdatedTaskView — возвращает актуальное представление задачи после отката.]`

#### AC
- When `tasks.rollback` to revision, Then файл восстановлен и создан новый commit.
- And MCP-команда `tasks.rollback` готова к выполнению сервером (не является заглушкой `NOT_IMPLEMENTED`).

#### DoD
- Тесты для rollback зелёные (интеграция с git).
- История git не переписывается (откат — отдельный коммит).
- При ошибках репозиторий не остаётся в полуизменённом состоянии.
