# HTTP API

WillClaw exposes a local Hono-based REST API and an SSE event stream.

Default bind:

- host: `127.0.0.1`
- port: `8420`

This document summarizes the current surface and the intent of each route family.

## Authentication Model

When auth is enabled, API access is scope-based.

Important route groups:

- read-only runtime and chat inspection
- write and mutation flows
- hosted tool execution
- event streaming
- session and token management

The Web UI uses the same API.

## Static And Health Routes

### `GET /health`

Simple health check.

### `GET /`

Serves the Web UI bundle.

### `GET /styles.css`

Serves the root stylesheet.

### `GET /styles/*`

Serves imported stylesheet assets.

### `GET /favicon.svg`

Serves the favicon.

### `GET /assets/*`

Serves built static assets from the Web bundle.

## Auth Routes

### `GET /api/auth/status`

Returns current auth state.

Typical use:

- Web shell boot
- unlock-screen decisions

### `POST /api/auth/session`

Creates a session from a bearer token.

Body shape:

```json
{
  "token": "wc_..."
}
```

### `POST /api/auth/pairing`

Creates a session from a valid pairing code.

Body shape:

```json
{
  "code": "wc_pair_..."
}
```

### `DELETE /api/auth/session`

Logs out the current Web session and clears the cookie.

### `GET /api/auth/tokens`

Lists token metadata available to the current authorized session.

### `POST /api/auth/tokens`

Creates a managed token.

Body shape:

```json
{
  "id": "optional-id",
  "scopes": ["api:read", "api:write", "api:session"]
}
```

### `DELETE /api/auth/tokens/:tokenId`

Revokes a managed token.

### `GET /api/auth/sessions`

Lists active sessions.

### `DELETE /api/auth/sessions/:sessionId`

Revokes an active session.

## Pairing Routes

### `GET /api/pairing`

Returns pairing enablement, invites, and channel grants.

### `POST /api/pairing/invites`

Creates a pairing invite.

Body shape:

```json
{
  "kind": "web",
  "ttlMinutes": 15,
  "maxUses": 1,
  "scopes": ["api:read", "api:write"]
}
```

For a channel invite:

```json
{
  "kind": "channel",
  "channels": ["telegram"]
}
```

### `POST /api/pairing/invites/:inviteId/revoke`

Revokes an invite.

### `POST /api/pairing/grants/:grantId/revoke`

Revokes a paired channel grant.

## Runtime Status Routes

### `GET /api/status`

Returns a broad runtime status payload for the UI.

Includes things such as:

- config-derived runtime values
- agent availability
- host tool summary
- auth status
- provider health

### `GET /api/agents`

Lists configured agents and availability.

### `GET /api/providers/health`

Returns browser and screen provider health, including per-action health.

### `GET /api/tools/catalog`

Returns hosted tool catalog entries, optionally scoped to an agent.

## Route Preview And Prompt Preview

### `GET /api/route-preview`

Predicts how a prompt is likely to route.

Typical query params:

- `text`
- `agent`
- `currentMode`

Useful for:

- UI route preview
- debugging routing rules

### `POST /api/prompt-preview`

Assembles and returns prompt sections for a given trigger.

Useful for:

- debugging bootstrap Markdown
- inspecting heartbeat vs chat prompt assembly

## Realtime Events

### `GET /api/events`

SSE stream for runtime events.

This powers:

- activity feeds
- live run updates
- stream previews

## Chat Routes

### `POST /api/chat`

Main chat entrypoint.

Body shape:

```json
{
  "text": "Read this repo and summarize startup",
  "agent": "codex",
  "history": [],
  "isGroup": false,
  "workingDirectory": "/path/to/repo",
  "executionMode": "foreground",
  "currentMode": "coding",
  "channel": "web",
  "chatId": "some-thread-id",
  "userId": "web-user"
}
```

Notes:

- `agent` is optional and explicit when set
- `executionMode` can be `foreground` or `background`
- built-in `/search` is handled without dispatching to a coding agent

### `GET /api/chats`

Lists chats, usually for a given channel.

### `GET /api/messages`

Lists messages, typically filtered by channel and chat id.

### `POST /api/messages/:id/revoke`

Revokes a user message lineage.

### `POST /api/messages/:id/edit`

Edits a prior user message and reruns from that point.

### `POST /api/messages/:id/resend`

Resends a message, optionally with explicit agent or mode settings.

### `GET /api/queues`

Returns queue information for active chats.

### `GET /api/runs/:runId`

Gets run status.

### `POST /api/runs/:runId/cancel`

Cancels a running job.

## Search And Memory Routes

### `GET /api/search`

General message search.

### `GET /api/memory/search`

Combined memory search across stored messages and indexed memory files.

### `POST /api/memory/reindex`

Reindexes workspace memory files.

### `POST /api/memory/daily-note/ensure`

Ensures a daily note exists.

Body shape:

```json
{
  "date": "2026-03-25"
}
```

### `POST /api/memory/daily-note/generate`

Generates daily note content.

Body shape:

```json
{
  "date": "2026-03-25",
  "agentName": "direct-api",
  "workingDirectory": "/path/to/repo"
}
```

### `POST /api/memory/compact`

Compacts `MEMORY.md`.

Body shape:

```json
{
  "agentName": "direct-api",
  "workingDirectory": "/path/to/repo",
  "limit": 200
}
```

## Scheduler Routes

### `GET /api/cron`

Returns known scheduled tasks, including heartbeat.

### `POST /api/heartbeat/run`

Runs heartbeat immediately.

### `POST /api/cron/:taskName/run`

Runs a named cron task immediately.

### `POST /api/maintenance/:taskName/run`

Runs a maintenance task such as log retention immediately.

## Hosted Browser Routes

Current browser route family includes:

- `POST /api/tools/browser/open`
- `POST /api/tools/browser/snapshot`
- `POST /api/tools/browser/inspect-page`
- `POST /api/tools/browser/fill-form`
- `POST /api/tools/browser/click`
- `POST /api/tools/browser/type`
- `POST /api/tools/browser/screenshot`

Shared concepts:

- optional `chatId`
- optional `timeoutMs`
- optional `sessionName`
- structured actions prefer compatible structured providers

## Hosted Screen Routes

Current screen route family includes:

- `POST /api/tools/screen/capture`
- `POST /api/tools/screen/see`
- `POST /api/tools/screen/click`
- `POST /api/tools/screen/type`
- `POST /api/tools/screen/press`
- `POST /api/tools/screen/ocr`
- `POST /api/tools/screen/frontmost-app`
- `POST /api/tools/screen/open-app`
- `POST /api/tools/screen/activate-app`
- `POST /api/tools/screen/inspect-app`
- `POST /api/tools/screen/send-text`

## Tool Log Routes

### `GET /api/logs/tools`

Lists tool log entries, with filters.

### `GET /api/logs/tools/stats`

Returns aggregated tool log stats.

### `GET /api/logs/tools/:id`

Returns a single tool log entry.

## Feishu Webhook Route

### `POST /api/channels/feishu/events`

Receives Feishu webhook events.

This is a channel adapter route, not a general user-facing API.

## API Advice

- Use REST if you want structured automation against the runtime.
- Use the Web UI for interactive shell use.
- Use SSE if you need live activity or stream-preview behavior.
- Treat hosted tool endpoints as privileged machine actions, not generic internet-exposed APIs.
