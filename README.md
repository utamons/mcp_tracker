# MCP Task Tracker

A minimal Jira-like task tracker exposed as an MCP server (stdio transport).

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

Start the MCP server (stdio):

```bash
npm start
```

or:

```bash
node server.js
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

## Using with Codex (MCP)

Add this server to Codex MCP servers:

```bash
codex mcp add mcp-tracker -- node /ABS/PATH/TO/mcp_tracker/server.js
```

List configured servers:

```bash
codex mcp list
```

Inspect a server config:

```bash
codex mcp get mcp-tracker
```

Remove the server config:

```bash
codex mcp remove mcp-tracker
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

### `tasks.create`

Creates a task file in a project directory and commits the change.

- Input:
  - `project` (string): must match `^[a-z0-9-]+$` and the directory must exist
  - `type` (enum): `user_story` | `bug`
  - `title` (string): non-empty
  - `body` (string, optional)
- Output: `{ ok: true, data: { id, project, type, title, status, created_at } }`

### `tasks.update`

Updates an existing task and commits the change.

- Input:
  - `project` (string): must match `^[a-z0-9-]+$` and the directory must exist
  - `id` (string): task ID (also the filename without `.md`)
  - `patch` (object):
    - `type` (optional enum): `user_story` | `bug`
    - `title` (optional string): non-empty
    - `body` (optional string): `""` clears the body
- Rules:
  - Only allowed when `status === "backlog"` (otherwise `FORBIDDEN_UPDATE_IN_STATUS`)
- Output: `{ ok: true, data: { id, project, type, title, status, created_at } }`

### `tasks.promote_to_todo`

Moves a task from `backlog` to `todo` and commits the change.

- Input:
  - `project` (string): must match `^[a-z0-9-]+$` and the directory must exist
  - `id` (string): task ID
- Rules:
  - Only allowed when `status === "backlog"` (otherwise `INVALID_STATUS_TRANSITION`)
- Output: `{ ok: true, data: { id, project, type, title, status, created_at } }`

### `tasks.list`

Lists tasks for a project with optional filtering.

- Input:
  - `project` (string): must match `^[a-z0-9-]+$` and the directory must exist
  - `status` (optional enum): `backlog` | `todo` | `in_progress` | `done` | `canceled`
  - `type` (optional enum): `user_story` | `bug`
  - `text` (optional string): case-insensitive substring match against `title` and `body`
- Output: `{ ok: true, data: { tasks: TaskView[] } }`
- `TaskView`:
  - `id`, `project`, `type`, `title`, `status`, `created_at`

### Not implemented yet

These tools are registered but currently return `NOT_IMPLEMENTED`:

- `tasks.claim`
- `tasks.done`
- `tasks.release`
- `tasks.cancel`
- `tasks.report`
- `tasks.history`
- `tasks.rollback`
- `tasks.verify`
