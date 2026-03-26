# Hosted Tools

Hosted tools are actions WillClaw itself performs on the local machine on behalf of an agent or user.

They are different from backend-native abilities. For example:

- a CLI coding agent may already have native file editing and shell execution
- an API model does not

WillClaw uses tool policy to decide when to expose hosted tools.

## Tool Families

Current hosted tool families:

- `shell`
- `filesystem`
- `browser`
- `screen`
- `memory_search`

## Tool Policy Model

Each agent sees each tool as one of:

- `native`
- `hosted`
- `disabled`

Meaning:

- `native`: trust the backend’s built-in capability
- `hosted`: WillClaw may expose its own local-machine implementation
- `disabled`: do not expose it

## Why This Exists

WillClaw is not trying to build an infinitely broad MCP replacement. The goal is narrower:

- expose local-machine power when needed
- keep it auditable
- avoid duplicating capabilities that strong coding agents already have natively

## Shell

The hosted shell tool runs commands on the WillClaw host machine.

Typical uses:

- operations tasks
- local machine inspection
- light automation from API-backed agents

Related config:

```yaml
tools:
  shell:
    confirm_destructive: true
    blocked_commands: ["rm", "rmdir"]
```

## Filesystem

The hosted filesystem tool lets WillClaw read and write host files.

Related config:

```yaml
tools:
  filesystem:
    delete_mode: trash
    archive_dir: "~/.willclaw/archive"
```

The delete model is intentionally conservative.

## Browser

Current browser capabilities:

- open URL
- snapshot
- click
- type
- screenshot
- inspect page
- fill form

### Providers

Configured provider order defaults to:

1. `agent-browser`
2. `system-open`

Important nuance:

- structured browser actions rely on `agent-browser`
- `system-open` is only a coarse fallback for plain URL opening
- WillClaw now avoids splitting one structured workflow across incompatible browser providers

### `inspect_page`

A higher-level workflow that can:

- open a page
- snapshot it
- optionally attach a screenshot

### `fill_form`

A higher-level workflow that can:

- open a page
- fill multiple fields
- optionally submit
- optionally snapshot and screenshot after submission

## Screen

Current screen and desktop capabilities:

- capture screenshot
- OCR
- inspect visible UI
- click
- type
- press keys
- inspect frontmost app
- open app
- activate app
- inspect app
- send text

### Providers

Configured provider order defaults to:

1. `peekaboo`
2. `screencapture`

Important nuance:

- structured desktop inspection depends on `peekaboo`
- `screencapture` is mainly a coarse screenshot fallback
- OCR uses Apple Vision through local system tooling

### `inspect_app`

A higher-level workflow that can:

- foreground or activate an app
- capture the current visible screen
- OCR it

## Memory Search

`memory_search` is a WillClaw-owned bridge over:

- stored messages
- `MEMORY.md`
- daily notes
- indexed workspace memory files

This is intentionally a narrow, runtime-owned capability rather than a generic external tool protocol.

## Hosted Browser / Screen Bridge

WillClaw can expose a narrow bridge to certain agents, especially API-backed ones.

Conceptually:

1. the agent emits exactly one hosted action line
2. WillClaw executes it
3. WillClaw injects the result back as system context
4. the agent continues

Marker format:

```text
WILLCLAW_HOSTED_ACTION {...}
```

This bridge is intentionally narrower than:

- shell execution
- generic file editing
- arbitrary desktop autonomy

## Provider Health

Before relying on browser or screen actions, check provider health:

```bash
willclaw doctor
```

The UI also reflects provider health and should now hide or disable actions that are not healthy and configured.

## Tool Logging And Auditability

Every WillClaw-owned host tool call should be auditable.

Current logging surfaces:

- app log text file
- SQLite tool execution log database

Inspect tool logs with:

```bash
willclaw logs --tool --no-follow
```

Examples:

```bash
willclaw logs --tool --tool-name browser --no-follow
willclaw logs --tool --tool-name screen --success false --no-follow
```

## Good Fits For Hosted Tools

- API-backed agents that need local machine access
- heartbeat or cron tasks that need a browser check
- one-shot screenshot or OCR tasks
- narrow form submission or inspection tasks

## Bad Fits For Hosted Tools

- replacing a CLI coding agent’s normal file-edit loop
- uncontrolled broad desktop automation
- pretending a weak browser fallback supports full structured automation

## macOS Notes

Hosted browser and especially hosted screen actions are currently most mature on macOS.

Potential prerequisites:

- `agent-browser`
- `peekaboo`
- `screencapture`
- system Accessibility permissions
- system Screen Recording permissions

## Operational Advice

- prefer explicit provider health checks before demos
- document provider installation in your team setup docs
- keep browser and screen expectations realistic on non-macOS hosts
