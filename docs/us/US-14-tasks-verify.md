### ID: US-14 — Verify

#### Цель
- Пользователь может быстро проверить целостность проекта и задач (формат, инварианты), чтобы избежать “тихих” ошибок от ручных правок.

#### Описание
- Реализовать инструмент `tasks.verify(project)`, который возвращает список нарушений (или пустой список).
- Проверки (минимум):
  - корректность имени проекта (regex);
  - уникальность `id` в проекте;
  - корректность статусов (в допустимом множестве);
  - обязательные/запрещённые поля в зависимости от статуса (`started_at/done_at/canceled_at/tool`);
  - корректность ISO-8601 timestamps с UTC-offset;
  - соответствие имени файла и `id` в frontmatter (одно значение).

#### Дизайн
- Классы/модули:
  - `ProjectRegistry` (`src/projects/ProjectRegistry.ts`) — методы: `isValidName(name: string): boolean`
  - `TaskStore` (`src/tasks/TaskStore.ts`) — методы: `list(project: string): Promise<TaskEntity[]>`
  - `TaskValidator` (`src/tasks/TaskValidator.ts`) — методы: `validate(task: TaskEntity): Violation[]`
  - `ProjectVerifier` (`src/tasks/ProjectVerifier.ts`) — методы: `verify(project: string): Promise<Violation[]>`, `checkUniqueIds(tasks: TaskEntity[]): Violation[]`
  - `TasksVerifyTool` (`src/mcp/tools/TasksVerifyTool.ts`) — методы: `execute(input): Promise<{ ok: true; data: { violations: Violation[] } }>`

#### Ссылки
- `docs/SPEC.md:99`
- `docs/SPEC.md:101`
- `docs/SPEC.md:103`
- `docs/SPEC.md:115`
- `docs/SPEC.md:117`
- `docs/SPEC.md:118`
- `docs/SPEC.md:119`
- `docs/SPEC.md:120`
- `docs/SPEC.md:121`
- `docs/SPEC.md:140`
- `docs/SPEC.md:371`
- `docs/SPEC.md:375`
- `docs/SPEC.md:376`

#### Тесты (TDD)
- `[Verify_validProject_noViolations — для корректного проекта возвращает пустой список нарушений.]`
- `[Verify_invalidProjectName — при некорректном имени проекта возвращает нарушение.]`
- `[Verify_duplicateIds — при повторяющихся id возвращает нарушение уникальности.]`
- `[Verify_missingRequiredFields — отсутствует started_at/done_at/canceled_at для соответствующего статуса.]`
- `[Verify_forbiddenFieldsInBacklogTodo — наличие started_at/done_at/canceled_at/tool в backlog/todo считается нарушением.]`
- `[Verify_invalidTimestampFormat — невалидный ISO-8601 timestamp считается нарушением.]`
- `[Verify_fileNameMismatch — несовпадение имени файла и id в frontmatter считается нарушением.]`

#### AC
- When `tasks.verify(project)`, Then возвращается список нарушений (или пусто).
- Проверки: корректность имени проекта, уникальность id, корректность статусов/переходов, обязательные поля по статусу.
- And MCP-команда `tasks.verify` готова к выполнению сервером (не является заглушкой `NOT_IMPLEMENTED`).

#### DoD
- Тесты для verify зелёные.
- Нарушения возвращаются в структурированном виде (тип/код/сообщение), чтобы их можно было показывать или логировать.
- Verify не модифицирует репозиторий и не создаёт git-коммиты.
