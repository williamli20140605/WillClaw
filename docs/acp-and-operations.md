# ACP And Operations

This document covers the optional ACP server, logs, health checks, and macOS auto-start.

## ACP Server

WillClaw can expose an ACP server on a separate port.

Default config:

```yaml
acp:
  server:
    enabled: false
    port: 8421
```

The ACP server is disabled by default.

## ACP Auth

ACP requires bearer-token auth with the `acp` scope.

If auth is enabled and the token lacks `acp`, ACP requests are rejected.

ACP also uses the same in-memory rate-limiting system as other authenticated surfaces.

## ACP Capabilities

Current ACP behavior includes:

- list agent descriptors
- get the WillClaw ACP agent descriptor
- run in `sync`, `stream`, or `async` mode
- inspect async run state
- cancel async runs

The ACP surface currently presents one logical agent:

- `willclaw`

That ACP agent is really a gateway into the configured WillClaw orchestration stack.

## ACP Run Modes

### Sync

Request waits for completion and returns the final result.

### Stream

Request streams deltas over SSE-like behavior from the ACP layer.

### Async

Request returns quickly with a run id, and the client can poll or inspect status later.

## When ACP Is Useful

- integrating WillClaw into another orchestrator
- exposing WillClaw as a single logical agent endpoint
- getting streamed or async access without building a browser UI client

## App Logs

WillClaw maintains an app log file, typically:

- `~/.willclaw/logs/willclaw.log`

Inspect it with:

```bash
willclaw logs --no-follow
```

Use app logs for:

- startup failures
- channel start problems
- scheduler or maintenance errors
- provider issues that bubble to runtime logging

## Tool Logs

Hosted tool calls are written to a SQLite-backed tool log database.

Typical location:

- `~/.willclaw/logs/tool-executions.db`

Inspect with:

```bash
willclaw logs --tool --no-follow
```

Useful filters:

```bash
willclaw logs --tool --tool-name browser --no-follow
willclaw logs --tool --agent codex --success false --no-follow
willclaw logs --tool --chat-id <chatId> --no-follow
```

## Provider Health

Before trusting browser or screen flows, check:

```bash
willclaw doctor
```

This is especially important for:

- demos
- scheduled browser tasks
- host-lab usage
- API-backed agents using hosted tools

## Log Retention

WillClaw includes a scheduled log maintenance task.

Relevant config:

```yaml
logging:
  retain_days: 90
  retention_schedule: "25 3 * * *"
```

This can prune old log records and keep log growth under control.

## LaunchAgent

On macOS, WillClaw can install a LaunchAgent to auto-start on login.

Commands:

```bash
willclaw launch-agent install
willclaw launch-agent status
willclaw launch-agent uninstall
willclaw launch-agent print
```

### What Installation Does

The LaunchAgent definition:

- uses the active Node executable
- runs the CLI entrypoint with `start`
- passes `--home <resolved home>`
- sets working directory to the WillClaw home
- writes stdout and stderr logs into the WillClaw log directory
- injects environment variables from `daemon.env_file`

### Important Constraints

- LaunchAgent support is macOS-only
- commands require a user session
- PATH issues can still matter, so inspect the generated plist if startup behaves differently than a shell launch

## Operational Runbook

### Check basic health

```bash
willclaw status
willclaw agents
willclaw doctor
```

### Check logs

```bash
willclaw logs --no-follow
willclaw logs --tool --no-follow
```

### Check auth or pairing state

Use the Web inspector if you have `api:session`, or inspect the relevant APIs.

### Restart cleanly

If running in a terminal:

- stop the `start` process
- fix config or environment
- start again

If running through LaunchAgent:

```bash
willclaw launch-agent uninstall
willclaw launch-agent install
```

## Production Caution

WillClaw is best thought of as a powerful local or trusted-network runtime. If you expose it more broadly:

- keep auth enabled
- keep the host bound narrowly
- audit hosted tool exposure carefully
- review channel and pairing behavior
