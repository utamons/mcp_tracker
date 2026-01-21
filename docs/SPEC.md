Ниже — draft-спецификация **MCP Task Tracker (минималистичный, Markdown + Git)** по шаблону.

---

# SPEC: MCP Task Tracker (Markdown + Git)

## Метаданные

* **Статус**: draft
* **Дата**: 2026-01-21
* **Автор/ответственный**: владелец репозитория
* **Компонент**: MCP-сервер (Node.js)
* **Связанные документы/тикеты**: нет

## Цель

* Дать агентам и тебе минимальный интерфейс для работы с задачами: создать/обновить/взять/завершить.
* Хранить задачи в Markdown, а историю/версии/откаты обеспечить через Git.
* Уметь строить простой отчёт: “сделано за период” и “осталось”.

## Контекст

* Соло-проект, один хост.
* Агенты (Codex CLI / Claude Code CLI) уже работают с задачами в Markdown.
* Планируется один MCP-сервер на Node.js, работающий с Git-репозиторием → источник истины = Markdown, история = Git.

## Область (scope)

* **Включено**:

    * Проекты (frontend/backend/devops) как namespace задач.
    * Задачи как Markdown-файлы.
    * Статусы: `backlog → todo → in_progress → done` и `canceled`.
    * Правила редактирования: редактируемость только в `backlog`.
    * Claim: перевод `todo → in_progress` + timestamps.
    * Done: перевод `in_progress → done` + `done_at`.
    * История/версии/rollback через Git (коммиты + revert/restore).
    * Report по периоду на основе `done_at`.
    * Verify (валидация структуры/инвариантов).
* **Не включено (non-goals)**:

    * Конкурентные блокировки/leases, идемпотентность ретраев.
    * Дедупликация, зависимости/блокировки, приоритеты, теги, эпики/спринты.
    * Мультиюзерные права/ACL/RBAC.
    * Веб-UI.

## Термины

* **Проект** — логический набор задач (например `frontend`), обычно соответствует папке.
* **Task ID** — уникальный индекс в пределах проекта (`FE-001`).

## Требования

### Функциональные

* Система хранит задачи в виде отдельных `.md` файлов.
* Система поддерживает проекты и операции в рамках проекта.
* MCP-сервер должен поддерживать стандартный запрос списка инструментов (tools) и возвращать актуальный список доступных tools (стандарт MCP: `tools/list`).
* Для каждой задачи:

    * есть уникальный `id` в рамках проекта;
    * есть `type` (минимум: `user_story | bug`), `title`, `status`;
    * есть `created_at`;
    * при `claim` фиксируются `tool?`, `started_at`;
    * при `done` фиксируется `done_at`.
    * при `cancel` фиксируется `canceled_at`.
* Операции:

    * Создание задачи в `backlog`.
    * Редактирование задачи (только разрешённые поля и только в разрешённых статусах).
    * Перевод `backlog → todo` (ручное “я проверил, можно брать”).
    * Claim (агент): `todo → in_progress`.
    * Done (агент): `in_progress → done`.
    * Release/Unclaim (агент): `in_progress → todo` (освободить задачу для повторного взятия).
    * Cancel: из `backlog/todo/in_progress` в `canceled`.
    * Получение списка задач (по статусам, проекту).
    * Report по периоду: сколько `done` и сколько не `done`.
    * History: показать git-историю файла задачи.
    * Rollback: откатить задачу к выбранной ревизии через Git (не переписывая историю).
    * Verify: проверить инварианты проекта/задач.

### Нефункциональные

* **Корректность**:

    * Инварианты (см. ниже) соблюдаются всегда; любые нарушения — ошибка операции.
    * Предусловие для любых write-операций: рабочее дерево Git чистое (иначе операция отклоняется).
* **Производительность**:

    * Для типичного объёма (до нескольких тысяч задач) операции должны выполняться “интерактивно” (локально).
* **Надёжность**:

    * При git-ошибках состояние репозитория не должно оставаться “полуизменённым” (либо всё закоммичено, либо ничего).
    * Каждая успешная операция, меняющая задачу, автоматически создаёт отдельный Git commit.
* **Совместимость**:

    * Формат задач — стабильный; изменения формата должны быть backward-compatible либо иметь миграцию.

## Инварианты и ограничения

* Имя проекта должно соответствовать `^[a-z0-9-]+$`.
* Task ID уникален в рамках проекта.
* Допустимые статусы: `backlog`, `todo`, `in_progress`, `done`, `canceled`.
* Допустимые переходы:

    * `backlog → todo`
    * `todo → in_progress`
    * `in_progress → done`
    * `in_progress → todo`
    * `backlog → canceled`
    * `todo → canceled`
    * `in_progress → canceled`
* Редактирование:

    * Полное редактирование содержания/метаданных разрешено только в `backlog`.
    * В `todo/in_progress/done/canceled` — запрещено (кроме системных полей при смене статуса).
* В `backlog/todo` запрещены поля `started_at`, `done_at`, `canceled_at`, `tool`.
* В `in_progress` обязательно присутствует `started_at`.
* В `done` обязательно присутствует `done_at`.
* В `canceled` обязательно присутствует `canceled_at`.
* Временные поля — ISO-8601 с UTC-offset (используется локальное время сервера).

## Входы/выходы и взаимодействия

* **Входные события/запросы (MCP tools)**:

    * `tools/list` (стандарт MCP: список доступных tools)
    * `projects.list`
    * `tasks.create(project, type, title, body?)`
    * `tasks.update(project, id, patch)` (ограничено статусом)
    * `tasks.promote_to_todo(project, id)`
    * `tasks.claim(project, id, tool?)`
    * `tasks.done(project, id)`
    * `tasks.release(project, id)`
    * `tasks.cancel(project, id)`
    * `tasks.list(project, status?, text?)`
    * `tasks.report(project, from, to)`
    * `tasks.history(project, id)` (git log)
    * `tasks.rollback(project, id, revision)` (git restore/revert + commit)
    * `tasks.verify(project)`

### Формат ответов (рекомендуемый)

* Все инструменты возвращают JSON-объект.
* Успех:

    * `ok: true`
    * `data: ...` (инструмент-специфично; для операций с задачей — актуальное представление задачи)

* Представление задачи (минимум, для create/update/claim/done/cancel/rollback):

    * `id`, `project`, `type`, `title`, `status`
    * `created_at`, `started_at?`, `done_at?`, `canceled_at?`
    * `tool?`
* Ошибка:

    * `ok: false`
    * `error.code: string` (машиночитаемый код)
    * `error.message: string` (сообщение **на английском**, для консистентности с логами)
    * `error.details?: object` (опционально)

### Коды ошибок (минимум)

* `INVALID_PROJECT_NAME`
* `PROJECT_NOT_FOUND`
* `TASK_NOT_FOUND`
* `INVALID_STATUS_TRANSITION`
* `FORBIDDEN_UPDATE_IN_STATUS`
* `INVALID_TASK_FORMAT`
* `GIT_REPO_NOT_FOUND`
* `GIT_DIRTY_WORKTREE`
* `GIT_OPERATION_FAILED`
* `IO_ERROR`
* **Выходы/эффекты**:

    * Создание/обновление `.md` файлов задач.
    * Git commit на каждое изменение.
    * Возврат структурированного результата: текущие поля задачи, статус, ошибки.
* **Зависимости**:

    * Локальный Git репозиторий.
    * Установленный `git` CLI.
    * Node.js runtime.
    * (Опционально) библиотека для работы с frontmatter/YAML.

## Данные и состояние

* **Персистенция**: Markdown файлы в рабочем git-репозитории.
* **Время**: все timestamps в локальном времени сервера.

### Формат задачи (предлагаемый)

* Путь: `<repoRoot>/<tasksRoot>/<project>/<ID>.md`
* YAML frontmatter (минимум):

    * `id: FE-001`
    * `project: frontend`
    * `type: user_story | bug`
    * `title: "..."`
    * `status: backlog | todo | in_progress | done | canceled`
    * `created_at: 2026-01-21T12:00:00+02:00`
    * `started_at: ...` (для in_progress/done/canceled, если задача бралась в работу)
    * `done_at: ...` (только для done)
    * `tool: codex-cli | claude-code-cli` (опционально)
    * `canceled_at: ...` (только для canceled)

### Требования к содержимому файла

* Файл задачи состоит из YAML frontmatter (между строками `---`) и Markdown-тела.
* Тело задачи — произвольный Markdown (описание, AC, ссылки), но после выхода из `backlog` изменяться не должно (кроме системных полей frontmatter при смене статуса).

## Дизайн решения (high-level)

* **Компоненты**:

    * `ProjectRegistry` — обнаружение проектов как подпапок `tasksRoot` + нормализация имени проекта (см. ограничения на имена проектов).
    * `TaskStore` — чтение/запись Markdown + frontmatter.
    * `IdAllocator` — выдача следующего ID (скан папки или счётчик-файл).
    * `WorkflowRules` — проверки статусов/переходов/редактирования.
    * `GitPort` — commit/log/restore/revert.
    * `ReportService` — агрегирует по `done_at`.
* **Поток обработки** (пример: claim):

    1. Загрузить задачу.
    2. Проверить инварианты и переход `todo → in_progress`.
    3. Выставить `started_at`.
    4. Сохранить файл.
    5. Сделать git commit с сообщением `claim FE-001`.
* **Алгоритм/правила**:

    * `id` задачи имеет вид `<PREFIX>-<NNN>` и уникален в рамках проекта.
    * `PREFIX` вычисляется из имени проекта (папки) детерминированно: разбить по `[-_ ]`, взять первые буквы первых 2 токенов, привести к верхнему регистру; если токен 1 — взять первые 2 буквы (например `front-end` → `FE`, `dev-ops` → `DO`, `frontend` → `FR`).
    * `NNN` — трёхзначный номер с нулями слева; следующий номер выбирается как `max(existing)+1` в папке проекта.
    * Rollback делается как новое изменение в Git (restore/revert) + отдельный commit `rollback FE-001 to <rev>`.

## Обработка ошибок и деградация

* Ошибки:

    * Несуществующий проект/задача.
    * Некорректное имя проекта (не проходит ограничения).
    * Неверный переход статуса.
    * Попытка редактирования в запрещённом статусе.
    * Нарушение обязательных полей (`done_at`, `canceled_at`).
    * Git ошибки (dirty state, конфликт, отсутствует repo).
* Реакция:

    * Операция атомарна на уровне “файл+commit”: до начала проверяется чистое рабочее дерево; затем изменения вносятся, добавляются в индекс и коммитятся; при ошибке выполняется восстановление файла из `HEAD`, и операция возвращает ошибку.
    * Без ретраев (локальный хост, минимализм).

## Наблюдаемость

* **Логи**:

    * info: create/claim/done/rollback/verify/report.
    * warn: попытки запрещённых правок, нарушения инвариантов.
    * error: git/IO ошибки.
    * Сообщения логгера — на английском.
    * Логи пишутся в файл `logFile` (см. конфигурацию).
* **Корреляция**:

    * в логах указывать `project`, `task_id`.

## Конфигурация

* `repoRoot` — путь к git-репо (по умолчанию `$HOME/.mcp_tracker/projects`).
* `tasksRoot` — путь к папке задач внутри репозитория (по умолчанию `tasks/`).
* Проекты = подпапки внутри `tasksRoot`. Создаются вручную (через создание папки).
* Ограничения на имя проекта: `^[a-z0-9-]+$`. Папки, не соответствующие формату, игнорируются, а в лог пишется `warn` (на английском).
* `logFile` — путь к файлу логов (по умолчанию `$HOME/.mcp_tracker/tracker.log`).
* `timezone`: локальная таймзона сервера (используется при генерации timestamps).
* (Опционально) `gitAuthorName`, `gitAuthorEmail` — подпись коммитов от MCP-сервера.

## User Stories

* **US-1: Получить список tools (discovery)**

    * AC:

        * When `tools/list`, Then возвращается актуальный список доступных инструментов (включая `projects.list` и все `tasks.*`).

* **US-2: Получить список проектов**

    * AC:

        * Given в `tasksRoot` есть подпапки проектов, When `projects.list`, Then возвращаются только проекты с именами, проходящими `^[a-z0-9-]+$`.

* **US-3: Создать задачу в backlog**

    * Описание: я создаю задачу, которая редактируема до перевода в todo.
    * AC:

        * Given проект существует и рабочее дерево Git чистое, When `tasks.create`, Then создан файл задачи с уникальным ID.
        * Then `id` соответствует `<PREFIX>-<NNN>`, `status=backlog`, `created_at` выставлен.
        * Then операция создаёт отдельный Git commit и возвращает представление задачи.
        * Given рабочее дерево Git не чистое, Then ошибка `GIT_DIRTY_WORKTREE`.

* **US-4: Отредактировать задачу в backlog**

    * AC:

        * Given `status=backlog` и рабочее дерево Git чистое, When `tasks.update`, Then разрешены изменения `type/title/body`.
        * Then операция создаёт отдельный Git commit и возвращает представление задачи.
        * Given `status≠backlog`, Then ошибка `FORBIDDEN_UPDATE_IN_STATUS`.

* **US-5: Перевести backlog → todo**

    * AC:

        * Given `status=backlog` и рабочее дерево Git чистое, When `tasks.promote_to_todo`, Then `status=todo` и создан commit.
        * Given `status≠backlog`, Then ошибка `INVALID_STATUS_TRANSITION`.

* **US-6: Посмотреть список задач**

    * AC:

        * When `tasks.list(project)`, Then возвращается список задач проекта.
        * When `tasks.list(project, status)`, Then возвращаются только задачи указанного статуса.
        * When `tasks.list(project, text)`, Then возвращаются задачи, где `text` найден в `title` и/или body.

* **US-7: Агент берёт задачу (claim)**

    * AC:

        * Given `status=todo` и рабочее дерево Git чистое, When `tasks.claim`, Then `status=in_progress`.
        * Then выставлен `started_at` (локальное время сервера), а редактирование body запрещено после claim.
        * Then создан отдельный Git commit.
        * Given `status≠todo`, Then ошибка `INVALID_STATUS_TRANSITION`.

* **US-8: Агент завершает задачу (done)**

    * AC:

        * Given `status=in_progress` и рабочее дерево Git чистое, When `tasks.done`, Then `status=done` и выставлен `done_at` (локальное время сервера).
        * Then создан отдельный Git commit.

* **US-9: Release/Unclaim**

    * AC:

        * Given `status=in_progress` и рабочее дерево Git чистое, When `tasks.release`, Then `status=todo`.
        * Then поля `started_at`, `tool` очищены и создан commit.

* **US-10: Отменить задачу (cancel)**

    * AC:

        * Given `status∈{backlog,todo}` и рабочее дерево Git чистое, When `tasks.cancel`, Then `status=canceled` и выставлен `canceled_at`.
        * Given `status=in_progress` и рабочее дерево Git чистое, When `tasks.cancel`, Then `status=canceled` и выставлен `canceled_at`.
        * Then при успехе создан отдельный Git commit.

* **US-11: Отчёт за период**

    * AC:

        * Given from/to, When `tasks.report`, Then `done_count` считается по `done_at` внутри периода.
        * Then `remaining_count` = все задачи кроме `done/canceled`.

* **US-12: История**

    * AC:

        * When `tasks.history`, Then возвращается git-log для файла задачи.

* **US-13: Откат**

    * AC:

        * When `tasks.rollback` to revision, Then файл восстановлен и создан новый commit.

* **US-14: Verify**

    * AC:

        * When `tasks.verify(project)`, Then возвращается список нарушений (или пусто).
        * Проверки: корректность имени проекта, уникальность id, корректность статусов/переходов, обязательные поля по статусу.

## Критерии приёмки модуля

* `tools/list` возвращает актуальный список инструментов.
* Можно создать задачу, отредактировать в `backlog`, перевести в `todo`, агент может `claim`, `release`, `done`, `cancel` (включая `cancel` из `in_progress`).
* Запрещённые правки (не в `backlog`) отклоняются.
* Отчёт за период корректно считает `done` по `done_at`.
* History и rollback работают через Git и не переписывают историю.
* Verify ловит типовые нарушения формата/инвариантов и некорректные имена проектов.

## План внедрения и обратимость

* **Релиз**: подключение MCP сервера локально, настройка `repoRoot` и `tasksRoot`.
* **Откат**: отключить MCP, все данные остаются в Markdown + Git; откаты изменений — стандартные git-команды.

## Риски и вопросы

* **Риски**:

    * Расхождение формата задач при ручных правках → снижается за счёт `verify`.
    * “Слишком много коммитов” (commit на каждую операцию) → принимается как плата за прозрачность истории.

## Реализация (заполняется после выполнения)

* TBD

## Лог решений, changelog

* DEC-1 (2026-01-21): источник истины = Markdown; история/rollback = Git.
* DEC-2 (2026-01-21): добавлены `release/unclaim` (`in_progress → todo`) и `cancel` из `in_progress`.
* DEC-3 (2026-01-21): имена проектов ограничены `^[a-z0-9-]+$`; некорректные папки проектов игнорируются с `warn` в логах.
* DEC-4 (2026-01-21): `repoRoot` по умолчанию `$HOME/.mcp_tracker/projects`, логи по умолчанию в `$HOME/.mcp_tracker/tracker.log`, timestamps генерируются в локальной таймзоне сервера.
