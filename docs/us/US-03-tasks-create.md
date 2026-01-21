### ID: US-3 — Создать задачу в backlog

#### Цель
- Пользователь может создать новую задачу в `backlog`, которую можно редактировать до перевода в `todo`.

#### Описание
- Реализовать инструмент `tasks.create(project, type, title, body?)`.
- Создавать Markdown-файл задачи по пути `<repoRoot>/<tasksRoot>/<project>/<ID>.md` с YAML frontmatter и Markdown-телом.
- Генерировать `id` по правилам `PREFIX + NNN`, выставлять `status=backlog`, `created_at` (локальное время сервера).
- Перед изменениями проверять чистоту рабочего дерева Git; при грязном дереве возвращать `GIT_DIRTY_WORKTREE`.
- На каждое успешное создание делать отдельный Git commit и возвращать актуальное представление задачи.

#### Дизайн
- Классы/модули:
  - `WorktreeGuard` (`src/git/WorktreeGuard.ts`) — методы: `assertClean(): Promise<void>`
  - `IdAllocator` (`src/tasks/IdAllocator.ts`) — методы: `nextId(project: string): Promise<string>`
  - `TaskStore` (`src/tasks/TaskStore.ts`) — методы: `write(task: TaskEntity): Promise<void>`, `taskPath(project: string, id: string): string`
  - `Clock` (`src/infra/Clock.ts`) — методы: `nowIsoWithOffset(): string`
  - `GitPort` (`src/git/GitPort.ts`) — методы: `commitAll(message: string): Promise<void>`
  - `TasksCreateTool` (`src/mcp/tools/TasksCreateTool.ts`) — методы: `execute(input): Promise<{ ok: true; data: TaskView }>`

#### Ссылки
- `docs/SPEC.md:69`
- `docs/SPEC.md:87`
- `docs/SPEC.md:129`
- `docs/SPEC.md:191`
- `docs/SPEC.md:193`
- `docs/SPEC.md:229`
- `docs/SPEC.md:231`
- `docs/SPEC.md:288`
- `docs/SPEC.md:293`
- `docs/SPEC.md:296`
- `docs/SPEC.md:162`

#### Тесты (TDD)
- `[TasksCreate_createsFileWithFrontmatter — создаёт файл с YAML frontmatter и Markdown-телом (путь, поля, формат).]`
- `[TasksCreate_allocatesNextId_emptyProject — выдаёт корректный PREFIX и NNN=001 для пустого проекта.]`
- `[TasksCreate_allocatesNextId_existingTasks — выдаёт NNN=max+1 при наличии задач в папке проекта.]`
- `[TasksCreate_setsCreatedAtAndStatus — выставляет created_at и status=backlog.]`
- `[TasksCreate_requiresCleanWorktree — при грязном git-worktree возвращает GIT_DIRTY_WORKTREE.]`
- `[TasksCreate_commitsOnce — выполняет ровно один git commit на успешное создание.]`
- `[TasksCreate_returnsTaskView — возвращает представление задачи с минимумом полей из спеки.]`

#### AC
- Given проект существует и рабочее дерево Git чистое, When `tasks.create`, Then создан файл задачи с уникальным ID.
- Then `id` соответствует `<PREFIX>-<NNN>`, `status=backlog`, `created_at` выставлен.
- Then операция создаёт отдельный Git commit и возвращает представление задачи.
- Given рабочее дерево Git не чистое, Then ошибка `GIT_DIRTY_WORKTREE`.

#### DoD
- Тесты для `tasks.create` зелёные (включая интеграционный сценарий с реальным git-репо в temp-директории).
- Формат файла задачи соответствует требованиям (frontmatter + body).
- Коммит создаётся на каждую успешную операцию и не оставляет “полуизменённого” состояния при ошибках.

