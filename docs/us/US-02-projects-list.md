### ID: US-2 — Получить список проектов

#### Цель
- Пользователь/агент может увидеть, какие проекты (namespace задач) доступны для работы.

#### Описание
- Реализовать инструмент `projects.list`, который сканирует `tasksRoot` и возвращает список подпапок проектов.
- Возвращать только проекты, имена которых проходят ограничение `^[a-z0-9-]+$`.
- Папки, не проходящие формат, игнорировать; дополнительно писать `warn` в лог (сообщение — на английском).

#### Дизайн
- Классы/модули:
  - `Config` (`src/config/Config.ts`) — методы: `getRepoRoot(): string`, `getTasksRoot(): string`
  - `ProjectRegistry` (`src/projects/ProjectRegistry.ts`) — методы: `list(): Promise<string[]>`, `isValidName(name: string): boolean`
  - `ProjectsListTool` (`src/mcp/tools/ProjectsListTool.ts`) — методы: `execute(): Promise<{ ok: true; data: { projects: string[] } }>`
  - `Logger` (`src/infra/Logger.ts`) — методы: `warn(message: string, meta?: object): void`

#### Ссылки
- `docs/SPEC.md:101`
- `docs/SPEC.md:128`
- `docs/SPEC.md:264`
- `docs/SPEC.md:269`
- `docs/SPEC.md:282`

#### Тесты (TDD)
- `[ProjectRegistry_list_filtersInvalidNames — возвращает только проекты, проходящие regex имени.]`
- `[ProjectRegistry_list_logsWarnOnInvalid — игнорирует некорректные папки и пишет warn в лог.]`
- `[ProjectsListTool_returnsProjects — projects.list возвращает список проектов из ProjectRegistry.]`
- `[ProjectsListTool_ioError — при ошибке чтения tasksRoot возвращает IO_ERROR и error.message на английском.]`

#### AC
- Given в `tasksRoot` есть подпапки проектов, When `projects.list`, Then возвращаются только проекты с именами, проходящими `^[a-z0-9-]+$`.

#### DoD
- Тесты для `projects.list` зелёные.
- Логи для игнорируемых папок имеют уровень `warn` и текст на английском.
- Поведение детерминировано (повторный вызов при неизменном диске даёт тот же результат).

