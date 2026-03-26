# CLI

WillClaw’s CLI is the main operational entrypoint from the source tree.

Local source-tree form:

```bash
node packages/cli/dist/index.js
```

If linked globally:

```bash
willclaw
```

## Command Overview

Top-level commands:

- `init`
- `start`
- `launch-agent`
- `status`
- `sync-skills`
- `agents`
- `doctor`
- `logs`
- `pair`

## `init`

Initialize the WillClaw home directory.

```bash
willclaw init [--home <path>] [--force-config]
```

Use cases:

- first-time setup
- creating a test sandbox home
- reseeding config while preserving directory layout

Notes:

- `--force-config` overwrites `config.yaml`
- workspace bootstrap files and generated skills are also synced

## `start`

Initialize runtime and start the HTTP server.

```bash
willclaw start [--home <path>] [--no-listen]
```

Default behavior:

- starts enabled channels
- starts scheduler
- starts Web server
- starts ACP server only if enabled in config

Use `--no-listen` when you want initialization side effects without binding a port.

## `status`

Check whether the home directory and config are ready.

```bash
willclaw status [--home <path>]
```

Typical output includes:

- resolved home path
- whether config exists
- whether config is valid
- whether the app log exists
- configured agents and availability
- host tool provider summary

This is the best first diagnostic command.

## `sync-skills`

Refresh generated workspace skill docs.

```bash
willclaw sync-skills [--home <path>] [--workspace-dir <path>] [--no-overwrite]
```

What it regenerates:

- `SKILLS.md`
- `SKILLS_INDEX.md`
- generated `workspace/skills/*/SKILL.md`

Use this if:

- generated skill docs drift from code
- you want to seed another workspace

## `agents`

List configured agents and whether they are locally reachable.

```bash
willclaw agents [--home <path>]
```

This is useful for verifying:

- CLI binary presence
- API-backed agent configuration
- tool policy summaries

## `doctor`

Show browser and screen provider health.

```bash
willclaw doctor [--home <path>]
```

Use this before relying on:

- hosted browser actions
- hosted screen actions
- runtime host lab
- browser or screen flows in API-backed agents

Health states are roughly:

- configured + healthy
- configured + degraded
- configured + missing
- inactive or unconfigured

## `logs`

Inspect app logs or tool execution logs.

```bash
willclaw logs [options]
```

Important options:

- `--tool`
- `--tool-name <name>`
- `--action <name>`
- `--agent <name>`
- `--chat-id <id>`
- `--success <true|false>`
- `--lines <count>`
- `--no-follow`

Examples:

```bash
willclaw logs --no-follow
willclaw logs --tool --no-follow
willclaw logs --tool --tool-name browser --lines 50
willclaw logs --tool --agent codex --success false --no-follow
```

Use app logs for:

- startup issues
- channel crashes
- scheduler errors

Use tool logs for:

- browser/screen auditing
- debugging provider failures
- verifying hosted action usage

## `pair`

Manage one-time pairing invites and paired channel users.

Subcommands:

- `pair create`
- `pair list`
- `pair grants`
- `pair revoke-invite`
- `pair revoke-grant`

### `pair create`

```bash
willclaw pair create --kind <web|channel> [options]
```

Options:

- `--channel <name>` for channel invites
- `--ttl-minutes <minutes>`
- `--max-uses <count>`
- `--scope <scope>` for web invite scopes
- `--home <path>`

Examples:

```bash
willclaw pair create --kind web
willclaw pair create --kind web --scope api:read --scope api:write
willclaw pair create --kind channel --channel telegram
```

### `pair list`

Lists active and revoked invites with usage counts and expiry.

### `pair grants`

Lists paired channel users.

### `pair revoke-invite`

Revokes an invite by id.

### `pair revoke-grant`

Revokes an existing paired channel grant by id.

## `launch-agent`

macOS-only auto-start management.

Subcommands:

- `install`
- `uninstall`
- `status`
- `print`

Examples:

```bash
willclaw launch-agent install
willclaw launch-agent status
willclaw launch-agent uninstall
```

The generated plist:

- runs `node <entry> start --home <home>`
- uses the active WillClaw home
- writes stdout/stderr logs into the WillClaw logs directory
- injects environment from `daemon.env_file`

## Practical CLI Workflows

### First boot

```bash
willclaw init
willclaw status
willclaw agents
willclaw doctor
willclaw start
```

### Generate a Web login code

```bash
willclaw pair create --kind web
```

### Debug browser provider issues

```bash
willclaw doctor
willclaw logs --tool --tool-name browser --no-follow
```

### Debug queueing or runtime failures

```bash
willclaw logs --no-follow
willclaw logs --tool --no-follow
```

## Exit Status And Automation Notes

The CLI is currently written as a human-first operational tool rather than a strict machine-parseable interface. For scripted use:

- prefer REST endpoints when you need stable structured data
- use CLI commands mainly for local administration and inspection
