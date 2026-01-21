### ID: US-11 — Отчёт за период

#### Цель
- Пользователь получает быстрый отчёт: сколько задач сделано за период и сколько осталось незавершённых.

#### Описание
- Реализовать инструмент `tasks.report(project, from, to)`.
- `done_count` считать по `done_at`, попадающему в период `[from, to]` (границы включительно).
- `remaining_count` считать как количество задач проекта, чьи статусы не входят в `{done, canceled}`.
- Валидация входов: `from/to` обязаны быть валидными ISO-8601 строками; при `from > to` возвращать `INVALID_TASK_FORMAT`.

#### Дизайн
- Классы/модули:
  - `TaskStore` (`src/tasks/TaskStore.ts`) — методы: `list(project: string): Promise<TaskEntity[]>`
  - `ReportService` (`src/report/ReportService.ts`) — методы: `build(project: string, fromIso: string, toIso: string): Promise<{ done_count: number; remaining_count: number }>`
  - `TimeRange` (`src/report/TimeRange.ts`) — методы: `parse(fromIso: string, toIso: string): TimeRange`, `contains(iso: string): boolean`
  - `TasksReportTool` (`src/mcp/tools/TasksReportTool.ts`) — методы: `execute(input): Promise<{ ok: true; data: ReportView }>`

#### Ссылки
- `docs/SPEC.md:77`
- `docs/SPEC.md:137`
- `docs/SPEC.md:121`
- `docs/SPEC.md:352`
- `docs/SPEC.md:356`
- `docs/SPEC.md:357`

#### Тесты (TDD)
- `[Report_countsDoneInRange_inclusive — считает done_count по done_at в периоде, включая границы.]`
- `[Report_remainingExcludesDoneCanceled — remaining_count исключает done и canceled.]`
- `[Report_handlesNoDone — корректно возвращает done_count=0 при отсутствии done в периоде.]`
- `[Report_invalidRange_fromAfterTo — при from>to возвращает INVALID_TASK_FORMAT.]`
- `[Report_invalidTimestamps — при невалидных from/to возвращает INVALID_TASK_FORMAT.]`

#### AC
- Given from/to, When `tasks.report`, Then `done_count` считается по `done_at` внутри периода.
- Then `remaining_count` = все задачи кроме `done/canceled`.
- And MCP-команда `tasks.report` готова к выполнению сервером (не является заглушкой `NOT_IMPLEMENTED`).

#### DoD
- Тесты для report зелёные.
- Сравнение времени выполняется по реальным моментам времени (учитывается UTC-offset).
- Формат ответа соответствует стандартному `ok/data` контракту.
