### ID: US-1 — Получить список tools (discovery)

#### Цель
- Пользователь/агент может автоматически обнаружить, какие инструменты доступны у MCP-сервера, без чтения документации.

#### Описание
- Реализовать обработку стандартного MCP-запроса `tools/list`, возвращающего актуальный список доступных tools.
- В списке должны присутствовать `projects.list` и все инструменты семейства `tasks.*`.
- Формат ответа: JSON-объект с `ok: true` и данными инструмента, либо `ok: false` с ошибкой (сообщение ошибки — на английском).

#### Дизайн
- Классы/модули:
  - `McpServerAdapter` (`src/mcp/McpServerAdapter.ts`) — методы: `start()`, `registerTools(registry)`, `handleToolsList(): Promise<object>`
  - `ToolRegistry` (`src/mcp/ToolRegistry.ts`) — методы: `register(def): void`, `list(): ToolDefinition[]`
  - `ToolsListTool` (`src/mcp/tools/ToolsListTool.ts`) — методы: `execute(): Promise<{ ok: true; data: ToolDefinition[] }>`

#### Ссылки
- `docs/SPEC.md:58`
- `docs/SPEC.md:125`
- `docs/SPEC.md:142`
- `docs/SPEC.md:274`
- `docs/SPEC.md:276`
- `docs/SPEC.md:380`

#### Тесты (TDD)
- `[ToolsListTool_returnsRegisteredTools — возвращает актуальный список зарегистрированных tools.]`
- `[ToolsListTool_includesProjectsAndTasks — список включает projects.list и все tasks.*.]`
- `[ToolsListTool_responseShape — формат ответа соответствует ok/data и error.message на английском при ошибке.]`
- `[ToolRegistry_isDeterministic — порядок/выдача списка детерминированы для воспроизводимости тестов.]`

#### AC
- When `tools/list`, Then возвращается актуальный список доступных инструментов (включая `projects.list` и все `tasks.*`).

#### DoD
- Тесты для `tools/list` зелёные.
- Список tools соответствует актуальной реализации (нет “мертвых”/несуществующих инструментов).
- Ошибки соответствуют рекомендованному формату и содержат `error.message` на английском.

