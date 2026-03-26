# Configuration

WillClaw loads configuration from:

- `~/.willclaw/config.yaml`
- `~/.willclaw/.env`

The `.env` file is loaded before the YAML is fully normalized, so YAML values can use `${ENV_VAR}` interpolation.

## Config Loading Rules

- `~` expands relative to the current user’s home directory
- `~/.willclaw/...` paths are normalized to the active WillClaw home
- `.env` is loaded from `daemon.env_file`
- `${VAR_NAME}` placeholders in YAML are replaced from `process.env` when available

## Top-Level Sections

The default config has these top-level sections:

- `server`
- `workspace`
- `agents`
- `acp`
- `channels`
- `heartbeat`
- `cron`
- `tools`
- `memory`
- `history`
- `logging`
- `daemon`

## `server`

Controls the local HTTP server and auth settings.

Important fields:

- `server.host`
  - default: `127.0.0.1`
- `server.port`
  - default: `8420`
- `server.auth_token`
  - optional legacy owner token
- `server.auth.tokens`
  - static configured bearer tokens
- `server.auth.managed_tokens_file`
  - persisted managed token store
- `server.auth.session.cookie_name`
  - default: `willclaw_session`
- `server.auth.session.ttl_hours`
  - default: `24`
- `server.auth.pairing.enabled`
  - default: `true`
- `server.auth.pairing.store_file`
  - persisted pairing invite/grant store
- `server.auth.pairing.code_ttl_minutes`
  - default: `15`
- `server.auth.pairing.max_uses`
  - default: `1`
- `server.auth.rate_limit.enabled`
  - default: `true`
- `server.auth.rate_limit.window_seconds`
  - default: `60`
- `server.auth.rate_limit.max_requests`
  - default: `240`

### Auth Model

Auth is only enforced if WillClaw resolves at least one valid token from:

- `server.auth_token`
- `server.auth.tokens`
- persisted managed tokens

If no tokens exist, the Web UI and API are effectively open on the bound host.

### Auth Scopes

Supported scopes:

- `api:read`
- `api:write`
- `api:tools`
- `api:events`
- `api:session`
- `acp`

Practical meaning:

- `api:read`: read-only REST access
- `api:write`: chat submission and mutation flows
- `api:tools`: hosted browser and screen endpoints
- `api:events`: SSE event stream access
- `api:session`: create/revoke sessions and managed tokens
- `acp`: ACP server access

## `workspace`

Controls prompt bootstrap assembly.

- `workspace.bootstrapMaxChars`
  - per-file maximum when loading workspace bootstrap Markdown
- `workspace.bootstrapTotalMaxChars`
  - total prompt bootstrap ceiling
- `workspace.include_files`
  - extra Markdown files under `workspace/` appended after the built-in bootstrap set

Built-in workspace prompt files:

- `IDENTITY.md`
- `AGENTS.md`
- `RULES.md`
- `WORK_MODES.md`
- `MEMORY.md`
- `HEARTBEAT.md`
- `PROJECT_HEARTBEAT.md`
- `SKILLS.md`
- `SKILLS_INDEX.md`

## `agents`

Controls backend definitions and route preferences.

### `agents.default`

Fallback backend when routing does not pick something more specific.

### `agents.routing`

Known route keys:

- `simple_qa`
- `hosted_tools`
- `read_only_coding`
- `coding`
- `long_context`
- `system`

These are preferences, not hard guarantees. Explicit user selection still wins.

### `agents.safety`

- `prompt_transport`
  - `stdin` or `argv`
- `mutating_fallback`
  - whether a mutating request may fallback to another agent if the first mutating backend fails

### `agents.pool`

Each named agent entry is one of:

- CLI agent
- API agent
- ACP agent

#### CLI agent fields

- `enabled`
- `type: cli`
- `command`
- `args`
- `timeout`
- `completion_notify`
- `output_format`
- `tool_policy`

#### API agent fields

- `enabled`
- `type: api`
- `provider`
- `model`
- `api_key_env`
- `max_tokens`
- `endpoint`
- `completion_notify`
- `tool_policy`

#### ACP agent fields

- `enabled`
- `type: acp`
- `url`
- `agent_id`
- optional `auth`
- `completion_notify`
- `tool_policy`

### Tool Policy

Each agent can override these tools:

- `shell`
- `filesystem`
- `browser`
- `screen`
- `memory_search`

Valid modes:

- `native`
- `hosted`
- `disabled`

Interpretation:

- `native`: the backend already has its own version of this capability
- `hosted`: WillClaw may expose a host-side implementation
- `disabled`: do not expose it

Default base behavior:

- CLI agents default to `shell/filesystem = native`
- API agents default to `shell/filesystem/browser/screen/memory_search = hosted`
- ACP agents default to everything disabled

## `acp`

Controls the optional ACP server.

- `acp.agents`
  - currently reserved
- `acp.server.enabled`
  - default: `false`
- `acp.server.port`
  - default: `8421`

See [ACP And Operations](./acp-and-operations.md) for details.

## `channels`

Supported channels:

- `telegram`
- `discord`
- `feishu`
- `web`

Each channel has:

- `enabled`
- per-provider credentials and access-control options

Examples:

- Telegram uses `token_env`, `owner_id`, `allowed_users`
- Discord uses `token_env`, `owner_id`, `allowed_users`
- Feishu uses app secret env names plus group mention behavior
- Web is usually enabled by default

See [Channels](./channels.md).

## `heartbeat`

Controls the scheduled health or recap prompt loop.

- `enabled`
- `interval`
- `agent`
- `notify`
- `silent_ok`
- `inject_files`

Typical use:

- hourly or daily check-in
- run with an API-backed agent
- optionally notify a channel

## `cron`

Custom named scheduled prompts.

Each entry includes:

- `schedule`
- `agent`
- `prompt`
- optional `notify`

Use this for:

- morning briefings
- project-specific daily jobs
- recurring summaries

## `tools`

Controls WillClaw-owned host tools.

### `tools.shell`

- `confirm_destructive`
- `blocked_commands`

### `tools.filesystem`

- `delete_mode`
- `archive_dir`

### `tools.browser`

- `headless`
- `providers`

Browser providers today:

- `agent-browser`
- `system-open`

### `tools.screen`

- `enabled`
- `providers`

Screen providers today:

- `peekaboo`
- `screencapture`

## `memory`

Controls context retention, indexing, and maintenance.

- `context_window_days`
- `max_history_messages`
- `search_reindex_on_start`
- `exclude_revoked`
- `daily_note`
- `compact`

`daily_note` fields:

- `enabled`
- `schedule`
- `agent`

`compact` fields:

- `enabled`
- `schedule`
- `agent`
- `limit`

## `history`

Controls markdown export of chat history.

- `enabled`
- `dir`
- `include_system`
- `git_auto_commit`
- `index_exports`

History export is convenient and human-readable, but SQLite remains the source of truth.

## `logging`

Controls log persistence.

- `tool_log_db`
- `app_log`
- `max_output_chars`
- `retain_days`
- `retention_schedule`

Two important outputs:

- app log text file
- SQLite tool execution log database

## `daemon`

Controls LaunchAgent-related settings.

- `plist_label`
- `env_file`

`env_file` is important even if you do not use LaunchAgent, because config loading also reads it.

## Example: Codex-Centric Setup

```yaml
agents:
  default: codex
  routing:
    simple_qa: codex
    read_only_coding: codex
    coding: codex
    long_context: gemini
    hosted_tools: direct-api
```

This setup means:

- most work stays on Codex
- very large-context tasks can still route to Gemini
- hosted browser or screen tasks can go to `direct-api`

## Example: Local-Only Minimal Setup

```yaml
server:
  host: "127.0.0.1"
  port: 8420

agents:
  default: codex
  pool:
    codex:
      enabled: true
      type: cli
      command: codex
      args: ["--full-auto"]
      timeout: 300
      completion_notify: background_only
      output_format: text
```

This is a good baseline if you want:

- a simple local Web shell
- one primary coding backend
- no channel complexity yet

## Configuration Advice

- Start simple and add routing rules only when they save real effort.
- Do not enable channels until auth and pairing behavior are understood.
- Use `doctor` before relying on browser or screen flows.
- Keep `host` at `127.0.0.1` unless you explicitly want remote reachability.
