# MCP Task Tracker

Минимальный Jira-подобный трекер задач, опубликованный как MCP-сервер через Streamable HTTP.

Tasks are stored as Markdown files with YAML frontmatter, and every write operation creates a Git commit.

## Requirements

- Node.js (tested with Node v22)
- Git CLI available in `PATH`
- A Git repository initialized at `~/.mcp_tracker/projects` (the projects root), with `user.name` and `user.email` configured

## Install / Build

No build step is required for the server. Install dependencies:

```bash
npm ci
```

Run tests:

```bash
npm test
```

## Run

Запуск MCP HTTP-сервера:

```bash
npm start
```

or:

```bash
node server.js
```

По умолчанию сервер слушает:

```text
http://127.0.0.1:3000/mcp
```

Адрес привязки и порт настраиваются через переменные окружения:

```bash
MCP_HTTP_HOST=127.0.0.1 MCP_HTTP_PORT=3000 npm start
```

## CLI

The CLI provides access to project task lists without starting the MCP server.

Capabilities:
- Reads tasks from `~/.mcp_tracker/projects/<project>`
- Groups output by `backlog`, `todo`, and `in_progress`
- Shows a single task's metadata and body by project and ID
- Imports a task from a Markdown file and creates a Git commit

List tasks for a project:

```bash
npm run tasks:list -- --project <project>
```

Output is grouped by `backlog`, `todo`, and `in_progress`, with lines in the form `ID — Title`.

Example:

```bash
npm run tasks:list -- --project ta-backend
```

```text
backlog:
todo:
in_progress:
TB-065 — Example task title
```

Show task details (metadata + body):

```bash
npm run tasks:get -- --project <project> --id <ID>
```

Output prints `field: value` pairs, followed by a blank line and the task body (if present).

Example:

```bash
npm run tasks:get -- --project ta-backend --id TB-065
```

```text
id: TB-065
project: ta-backend
type: user_story
title: Example task title
status: in_progress
created_at: 2026-01-21T10:00:00+00:00
started_at: 2026-01-21T10:05:00+00:00
tool: codex

Task body content...
```

Import a task from a Markdown file with frontmatter:

```bash
npm run tasks:import -- --project <project> --file <path/to/task.md>
```

The file must start with frontmatter containing `title` and `type`.
The created task body is copied from the Markdown content after frontmatter.
If frontmatter contains `id`, the imported task title is prefixed with that value
unless the title already contains it. The import accepts `story` as an alias for
`user_story`.

```md
---
id: DM-XCRT-006
title: "Зональный трейл `F1/F2/F3`"
type: story
---
## Description

Task body content...
```

## Storage layout

The server stores projects under:

- `~/.mcp_tracker/projects`

Important:

- The projects root (`~/.mcp_tracker/projects`) must be a Git repository, because the server checks worktree state and creates commits on every write operation.
- Example setup:

```bash
mkdir -p ~/.mcp_tracker/projects
cd ~/.mcp_tracker/projects
git init
git config user.email "you@example.com"
git config user.name "Your Name"
git commit --allow-empty -m "init"
```

Each project is a directory named by:

- `^[a-z0-9-]+$`

Each task is a single file:

- `~/.mcp_tracker/projects/<project>/<ID>.md`

Naming rule:

- Task `ID` (the filename and the `id` frontmatter field) must match `^[A-Z0-9-]+$` (uppercase letters only).

### Task file format

Example:

```md
---
id: FR-001
project: frontend
type: user_story
title: "My title"
status: backlog
created_at: 2026-01-21T15:03:23+05:00
---
## Description

Task body in Markdown...
```

Notes:

- `title` is stored as a JSON string (quoted) in frontmatter.
- `created_at` uses ISO-8601 with UTC offset.

## Использование с MCP-клиентами

Запустите сервер через `npm start`, затем настройте MCP-клиент на Streamable
HTTP endpoint:

```text
http://127.0.0.1:3000/mcp
```

## MCP tools reference

All tools return a JSON payload serialized as MCP `text` content.

### Common response shape

- Success:
  - `{ "ok": true, "data": ... }`
- Error:
  - `{ "ok": false, "error": { "code": string, "message": string } }`

### `projects.list`

Lists valid projects (directories) under `~/.mcp_tracker/projects`.

- Input: `{}` (no parameters)
- Output: `{ ok: true, data: { projects: string[] } }`

### `tasks.template`

Reads a task template file from the project directory based on the `type` input.

- Input:
  - `project` (string): must match `^[a-z0-9-]+$` and the directory must exist
  - `type` (string): must match `^[a-z0-9_-]+$` (e.g., `story` -> `STORY_TEMPLATE.md`)
- File selection:
  - The tool looks for `PROJECT_DIR/[TYPE]_TEMPLATE.md` where `[TYPE]` is the uppercased `type` value.
  - Example: `type: "bug"` -> `BUG_TEMPLATE.md`, `type: "story"` -> `STORY_TEMPLATE.md`.
- Valid types are determined by the `*_TEMPLATE.md` filenames present in the project directory.
- Errors:
  - `INVALID_TEMPLATE_TYPE` when `type` does not match `^[a-z0-9_-]+$`.
  - `TASK_TEMPLATE_NOT_FOUND` when the expected `*_TEMPLATE.md` file is missing.
- Output: `{ ok: true, data: { template: string } }`

### `tasks.create`

Creates a task file in a project directory and commits the change.

- Input:
  - `project` (string): must match `^[a-z0-9-]+$` and the directory must exist
  - `type` (enum): `user_story` | `bug` | `review`
  - `title` (string): non-empty
  - `body` (string, optional)
- Output: `{ ok: true, data: { id, project, type, title, status, created_at } }`
- Notes:
  - `id` in output must match `^[A-Z0-9-]+$`

### `tasks.update`

Updates an existing task and commits the change.

- Input:
  - `project` (string): must match `^[a-z0-9-]+$` and the directory must exist
  - `id` (string): task ID (also the filename without `.md`), must match `^[A-Z0-9-]+$`
  - `patch` (object):
    - `type` (optional enum): `user_story` | `bug` | `review`
    - `title` (optional string): non-empty
    - `body` (optional string): `""` clears the body
- Rules:
  - Only allowed when `status === "backlog"` (otherwise `FORBIDDEN_UPDATE_IN_STATUS`)
- Output: `{ ok: true, data: { id, project, type, title, status, created_at } }`

### `tasks.promote_to_todo`

Moves a task from `backlog` to `todo` and commits the change.

- Input:
  - `project` (string): must match `^[a-z0-9-]+$` and the directory must exist
  - `id` (string): task ID, must match `^[A-Z0-9-]+$`
- Rules:
  - Only allowed when `status === "backlog"` (otherwise `INVALID_STATUS_TRANSITION`)
- Output: `{ ok: true, data: { id, project, type, title, status, created_at } }`

### `tasks.claim`

Claims a task: moves it from `todo` to `in_progress`, sets `started_at`, optionally stores `tool`, and commits the change.

- Input:
  - `project` (string): must match `^[a-z0-9-]+$` and the directory must exist
  - `id` (string): task ID, must match `^[A-Z0-9-]+$`
  - `tool` (string, optional): the claiming tool name
- Rules:
  - Only allowed when `status === "todo"` (otherwise `INVALID_STATUS_TRANSITION`)
- Output: `{ ok: true, data: { id, project, type, title, status, created_at, started_at?, tool? } }`

### `tasks.done`

Completes a task: moves it from `in_progress` to `done`, sets `done_at`, and commits the change.

- Input:
  - `project` (string): must match `^[a-z0-9-]+$` and the directory must exist
  - `id` (string): task ID, must match `^[A-Z0-9-]+$`
- Rules:
  - Only allowed when `status === "in_progress"` (otherwise `INVALID_STATUS_TRANSITION`)
- Output: `{ ok: true, data: { id, project, type, title, status, created_at, done_at? } }`

### `tasks.release`

Releases a task back to the queue: moves it from `in_progress` to `todo`, clears `started_at` and `tool`, and commits the change.

- Input:
  - `project` (string): must match `^[a-z0-9-]+$` and the directory must exist
  - `id` (string): task ID, must match `^[A-Z0-9-]+$`
- Rules:
  - Only allowed when `status === "in_progress"` (otherwise `INVALID_STATUS_TRANSITION`)
- Output: `{ ok: true, data: { id, project, type, title, status, created_at } }`

### `tasks.cancel`

Cancels a task: moves it from `backlog`/`todo`/`in_progress` to `canceled`, sets `canceled_at`, and commits the change.

- Input:
  - `project` (string): must match `^[a-z0-9-]+$` and the directory must exist
  - `id` (string): task ID, must match `^[A-Z0-9-]+$`
- Rules:
  - Not allowed when `status` is `done` or `canceled` (otherwise `INVALID_STATUS_TRANSITION`)
- Output: `{ ok: true, data: { id, project, type, title, status, created_at, canceled_at? } }`

### `tasks.list`

Lists tasks for a project with optional filtering.

- Input:
  - `project` (string): must match `^[a-z0-9-]+$` and the directory must exist
  - `status` (optional enum): `backlog` | `todo` | `in_progress` | `done` | `canceled`
  - `type` (optional enum): `user_story` | `bug` | `review`
  - `text` (optional string): case-insensitive substring match against `title` and `body`
- Output: `{ ok: true, data: { tasks: TaskView[] } }`
- `TaskView`:
  - `id`, `project`, `type`, `title`, `status`, `created_at`

### `tasks.get`

Reads a single task by `id` and returns an extended representation (including `body` when it is non-empty).

- Input:
  - `project` (string): must match `^[a-z0-9-]+$` and the directory must exist
  - `id` (string): task ID (also the filename without `.md`), must match `^[A-Z0-9-]+$`
- Output: `{ ok: true, data: TaskDetails }`
- `TaskDetails`:
  - `id`, `project`, `type`, `title`, `status`, `created_at`
  - `started_at?`, `done_at?`, `canceled_at?`, `tool?`, `body?`

### `tasks.report`

Time range report: counts `done_count` by `done_at` within `[from, to]` (inclusive) and `remaining_count` as the number of tasks whose status is not in `{done, canceled}`.

- Input:
  - `project` (string): must match `^[a-z0-9-]+$` and the directory must exist
  - `from` (string): ISO-8601 timestamp with UTC offset
  - `to` (string): ISO-8601 timestamp with UTC offset
- Output: `{ ok: true, data: { done_count: number, remaining_count: number } }`

### `tasks.history`

Returns Git history for the task file in a structured form.

- Input:
  - `project` (string): must match `^[a-z0-9-]+$` and the directory must exist
  - `id` (string): task ID, must match `^[A-Z0-9-]+$`
- Output: `{ ok: true, data: { commits: GitCommit[] } }`
- `GitCommit`:
  - `hash`, `author`, `date`, `subject`

### `tasks.rollback`

Rolls back the task file to the specified Git revision and creates a separate commit like `rollback <ID> to <rev>`.

- Input:
  - `project` (string): must match `^[a-z0-9-]+$` and the directory must exist
  - `id` (string): task ID, must match `^[A-Z0-9-]+$`
  - `revision` (string): git revision (hash/branch/tag)
- Output: `{ ok: true, data: TaskView }`

### `tasks.verify`

Checks project and tasks integrity and returns a list of violations. Read-only: does not modify the repository and does not create Git commits.

- Input:
  - `project` (string): project name (can be invalid; in that case a violation is returned)
- Output: `{ ok: true, data: { violations: Violation[] } }`
- `Violation`:
  - `code`, `message`, `details?`

### Implemented tools

The server implements all tools listed in `tools/list`, including:

- `projects.list`
- `tasks.create`
- `tasks.get`
- `tasks.update`
- `tasks.promote_to_todo`
- `tasks.claim`
- `tasks.done`
- `tasks.release`
- `tasks.cancel`
- `tasks.list`
- `tasks.report`
- `tasks.history`
- `tasks.rollback`
- `tasks.verify`
- `tasks.template`
