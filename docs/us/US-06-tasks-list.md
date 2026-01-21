### ID: US-6 — Посмотреть список задач

#### Цель
- Пользователь/агент может получить список задач проекта и быстро отфильтровать их по статусу или найти по тексту.

#### Описание
- Реализовать инструмент `tasks.list(project, status?, text?)`.
- Возвращать список задач проекта; при `status` — только задачи указанного статуса; при `text` — задачи, где `text` найден в `title` и/или body.
- Если файл задачи не соответствует формату (frontmatter/обязательные поля) — возвращать `INVALID_TASK_FORMAT`.

#### Дизайн
- Классы/модули:
  - `TaskStore` (`src/tasks/TaskStore.ts`) — методы: `list(project: string): Promise<TaskEntity[]>`
  - `TaskQueryService` (`src/tasks/TaskQueryService.ts`) — методы: `list(project: string, filter: { status?: TaskStatus; text?: string }): Promise<TaskView[]>`
  - `TaskTextSearch` (`src/tasks/TaskTextSearch.ts`) — методы: `matches(task: TaskEntity, text: string): boolean`
  - `TasksListTool` (`src/mcp/tools/TasksListTool.ts`) — методы: `execute(input): Promise<{ ok: true; data: { tasks: TaskView[] } }>`

#### Ссылки
- `docs/SPEC.md:76`
- `docs/SPEC.md:136`
- `docs/SPEC.md:313`
- `docs/SPEC.md:317`
- `docs/SPEC.md:319`
- `docs/SPEC.md:169`

#### Тесты (TDD)
- `[TasksList_allTasks — без фильтров возвращает все задачи проекта.]`
- `[TasksList_filterByStatus — с status возвращает только задачи этого статуса.]`
- `[TasksList_textSearch_titleAndBody — с text ищет по title и body.]`
- `[TasksList_invalidTaskFormat — при некорректном формате любой задачи возвращает INVALID_TASK_FORMAT.]`
- `[TasksList_projectNotFound — для несуществующего проекта возвращает PROJECT_NOT_FOUND.]`

#### AC
- When `tasks.list(project)`, Then возвращается список задач проекта.
- When `tasks.list(project, status)`, Then возвращаются только задачи указанного статуса.
- When `tasks.list(project, text)`, Then возвращаются задачи, где `text` найден в `title` и/или body.
- And MCP-инструмент `tasks.list` зарегистрирован в MCP-сервере (виден в `tools/list`), имеет `inputSchema` с параметрами из описания, и при вызове выполняет реальную операцию (не возвращает `error.code=NOT_IMPLEMENTED`).

#### DoD
- Тесты для list зелёные.
- Поведение поиска по тексту задокументировано и воспроизводимо (без скрытых “умных” правил).
- Ошибки формата и отсутствия проекта возвращаются с корректными кодами.
