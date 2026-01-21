### ID: US-12 — История

#### Цель
- Пользователь/агент может увидеть историю изменений задачи по git-логам.

#### Описание
- Реализовать инструмент `tasks.history(project, id)`, который возвращает git-log для файла задачи.
- Результат должен быть структурированным (минимум: hash, author, date, subject), без необходимости парсить “сырой” текст.

#### Дизайн
- Классы/модули:
  - `TaskStore` (`src/tasks/TaskStore.ts`) — методы: `taskPath(project: string, id: string): string`, `exists(project: string, id: string): Promise<boolean>`
  - `GitPort` (`src/git/GitPort.ts`) — методы: `log(filePath: string): Promise<GitCommit[]>`
  - `HistoryService` (`src/git/HistoryService.ts`) — методы: `getTaskHistory(project: string, id: string): Promise<GitCommit[]>`
  - `TasksHistoryTool` (`src/mcp/tools/TasksHistoryTool.ts`) — методы: `execute(input): Promise<{ ok: true; data: { commits: GitCommit[] } }>`

#### Ссылки
- `docs/SPEC.md:78`
- `docs/SPEC.md:138`
- `docs/SPEC.md:359`
- `docs/SPEC.md:363`

#### Тесты (TDD)
- `[History_returnsGitLogForTaskFile — возвращает лог коммитов для конкретного файла задачи.]`
- `[History_taskNotFound — при отсутствии файла задачи возвращает TASK_NOT_FOUND.]`
- `[History_gitFailure — при ошибке git возвращает GIT_OPERATION_FAILED.]`
- `[History_resultIsStructured — возвращаемые данные имеют структурированную форму (hash/date/subject).]`

#### AC
- When `tasks.history`, Then возвращается git-log для файла задачи.
- And MCP-команда `tasks.history` готова к выполнению сервером (не является заглушкой `NOT_IMPLEMENTED`).

#### DoD
- Тесты для history зелёные (интеграция с git в temp-репозитории).
- Нет переписывания истории; история отражает реальные git-коммиты операций.
