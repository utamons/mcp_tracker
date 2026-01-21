### ID: US-15 — Прочитать задачу

#### Цель
- Пользователь/агент может прочитать одну задачу по `id` и получить её содержимое (frontmatter + Markdown body) в структурированном виде.

#### Описание
- Реализовать инструмент `tasks.get(project, id)`.
- Инструмент читает файл задачи `<repoRoot>/<project>/<id>.md`, валидирует формат и инварианты, и возвращает расширенное представление задачи (включая `body?`).
- Операция read-only: не требует чистого git-worktree и не делает git commit.
- Ошибки:
  - при невалидном имени проекта → `INVALID_PROJECT_NAME`;
  - при отсутствии проекта → `PROJECT_NOT_FOUND`;
  - при отсутствии файла задачи → `TASK_NOT_FOUND`;
  - при нарушении формата/инвариантов (frontmatter, обязательные поля, правила по статусам) → `INVALID_TASK_FORMAT`.
- Контракт `body`: если Markdown-тело отсутствует/пустое, поле `body` не возвращается.

#### Дизайн
- Классы/модули:
  - `TaskStore` (`src/tasks/TaskStore.ts`) — методы: `read(project: string, id: string): Promise<TaskEntity>`
  - `TasksGetTool` (`src/mcp/tools/TasksGetTool.ts`) — методы: `execute(input): Promise<{ ok: true; data: TaskDetails }>`

#### Ссылки
- `docs/SPEC.md:76`
- `docs/SPEC.md:102`
- `docs/SPEC.md:118`
- `docs/SPEC.md:133`
- `docs/SPEC.md:152`
- `docs/SPEC.md:157`
- `docs/SPEC.md:194`
- `docs/SPEC.md:212`
- `docs/SPEC.md:165`

#### Тесты (TDD)
- `[TasksGet_returnsTaskDetailsWithBody — возвращает расширенное представление задачи, включая body при наличии.]`
- `[TasksGet_invalidProjectName — при невалидном имени проекта возвращает INVALID_PROJECT_NAME.]`
- `[TasksGet_projectNotFound — при отсутствии проекта возвращает PROJECT_NOT_FOUND.]`
- `[TasksGet_taskNotFound — при отсутствии файла задачи возвращает TASK_NOT_FOUND.]`
- `[TasksGet_invalidTaskFormat — при нарушении формата/инвариантов возвращает INVALID_TASK_FORMAT.]`
- `[TasksGet_bodyEmptyOmitsBodyField — при пустом теле не возвращает поле body.]`

#### AC
- When `tasks.get(project, id)`, Then возвращается задача (frontmatter + body) в структурированном виде.
- Given `project` не существует, Then ошибка `PROJECT_NOT_FOUND`.
- Given `id` не существует, Then ошибка `TASK_NOT_FOUND`.
- Given задача не соответствует формату/инвариантам, Then ошибка `INVALID_TASK_FORMAT`.
- And MCP-инструмент `tasks.get` зарегистрирован в MCP-сервере (виден в `tools/list`), имеет `inputSchema` с параметрами из описания, и при вызове выполняет реальную операцию (не возвращает `error.code=NOT_IMPLEMENTED`).

#### DoD
- Тесты для `tasks.get` зелёные.
- Инструмент не делает git commit и не зависит от чистоты git-worktree.
- Возвращаемое представление задачи соответствует спеки (включая правило по `body?`).
