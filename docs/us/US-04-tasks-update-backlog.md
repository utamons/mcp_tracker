### ID: US-4 — Отредактировать задачу в backlog

#### Цель
- Пользователь может уточнить/поправить `type/title/body` задачи до того, как задача будет взята в работу.

#### Описание
- Реализовать инструмент `tasks.update(project, id, patch)`.
- Разрешать изменения `type`, `title`, `body` только когда `status=backlog`.
- В остальных статусах запрещать изменения и возвращать `FORBIDDEN_UPDATE_IN_STATUS`.
- Перед записью проверять чистоту рабочего дерева Git; на успех — отдельный commit.

#### Дизайн
- Классы/модули:
  - `TaskStore` (`src/tasks/TaskStore.ts`) — методы: `read(project: string, id: string): Promise<TaskEntity>`, `write(task: TaskEntity): Promise<void>`
  - `WorkflowRules` (`src/tasks/WorkflowRules.ts`) — методы: `assertCanUpdate(task: TaskEntity): void`
  - `TaskPatcher` (`src/tasks/TaskPatcher.ts`) — методы: `apply(task: TaskEntity, patch: TaskPatch): TaskEntity`
  - `WorktreeGuard` (`src/git/WorktreeGuard.ts`) — методы: `assertClean(): Promise<void>`
  - `GitPort` (`src/git/GitPort.ts`) — методы: `commitAll(message: string): Promise<void>`
  - `TasksUpdateTool` (`src/mcp/tools/TasksUpdateTool.ts`) — методы: `execute(input): Promise<{ ok: true; data: TaskView }>`

#### Ссылки
- `docs/SPEC.md:70`
- `docs/SPEC.md:113`
- `docs/SPEC.md:115`
- `docs/SPEC.md:130`
- `docs/SPEC.md:298`
- `docs/SPEC.md:302`
- `docs/SPEC.md:304`
- `docs/SPEC.md:167`
- `docs/SPEC.md:168`

#### Тесты (TDD)
- `[TasksUpdate_backlog_allowsTypeTitleBody — в backlog разрешены изменения type/title/body.]`
- `[TasksUpdate_nonBacklog_forbidden — в todo/in_progress/done/canceled возвращает FORBIDDEN_UPDATE_IN_STATUS.]`
- `[TasksUpdate_preservesSystemFields — не позволяет менять системные поля frontmatter через patch.]`
- `[TasksUpdate_requiresCleanWorktree — при грязном git-worktree возвращает GIT_DIRTY_WORKTREE.]`
- `[TasksUpdate_commitsOnce — создаёт один commit на успешное обновление.]`
- `[TasksUpdate_invalidTaskFormat — при некорректном формате файла/patch возвращает INVALID_TASK_FORMAT.]`

#### AC
- Given `status=backlog` и рабочее дерево Git чистое, When `tasks.update`, Then разрешены изменения `type/title/body`.
- Then операция создаёт отдельный Git commit и возвращает представление задачи.
- Given `status≠backlog`, Then ошибка `FORBIDDEN_UPDATE_IN_STATUS`.
- And MCP-инструмент `tasks.update` зарегистрирован в MCP-сервере (виден в `tools/list`), имеет `inputSchema` с параметрами из описания, и при вызове выполняет реальную операцию (не возвращает `error.code=NOT_IMPLEMENTED`).

#### DoD
- Тесты для `tasks.update` зелёные.
- Запрещённые правки не приводят к изменениям файлов/коммитам.
- Сообщения ошибок консистентны и на английском.
