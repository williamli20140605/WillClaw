# WillClaw

WillClaw is a local agent runtime for coding workflows. It gives you one place to run coding agents, a browser-based shell, optional chat-channel integrations, hosted tools on the local machine, and persistent memory/history around those runs.

It is designed for a setup where you want:

- a local Web UI for chatting with coding agents
- explicit agent selection or automatic routing
- optional access to host tools such as terminal, filesystem, browser, screen, and memory search
- persistent chat history, tool logs, and workspace memory
- optional Telegram, Discord, or Feishu entry points

## Documentation

Long-form documentation now lives in [`docs/`](./docs/README.md).

Recommended reading order:

1. [`docs/quick-start.md`](./docs/quick-start.md)
2. [`docs/configuration.md`](./docs/configuration.md)
3. [`docs/web-ui.md`](./docs/web-ui.md)
4. [`docs/cli.md`](./docs/cli.md)
5. [`docs/architecture.md`](./docs/architecture.md)

## What It Includes

- Web shell with multi-thread chat, agent picker, route preview, auth, pairing, and runtime inspector
- Agent orchestration across CLI agents and API-backed agents
- Hosted tools for terminal, filesystem, browser, screen, and memory search
- Workspace bootstrap prompt files such as `IDENTITY.md`, `AGENTS.md`, `RULES.md`, and `WORK_MODES.md`
- Chat persistence, tool execution logging, history export, daily notes, and memory compaction
- Scheduler support for heartbeat tasks, cron prompts, and log retention
- Optional channel adapters for Telegram, Discord, and Feishu
- Optional macOS LaunchAgent support for auto-start at login

## Repository Layout

```text
packages/core  Core runtime, HTTP server, orchestration, auth, tools, channels
packages/cli   CLI entrypoint (`willclaw`)
packages/web   Browser UI bundle served by the core server
```

## Requirements

- Node.js 20+
- pnpm 10+
- One or more agent backends installed or configured

Common defaults in the generated config expect some of these to exist:

- `claude`
- `codex`
- `gemini`
- `opencode`
- `ANTHROPIC_API_KEY` for the `direct-api` backend

Hosted browser and screen tooling are currently most practical on macOS. LaunchAgent support is macOS-specific.

## Quick Start

1. Install dependencies and build the workspace:

```bash
pnpm install
pnpm build
```

For local repository use, invoke the built CLI directly with:

```bash
node packages/cli/dist/index.js
```

2. Initialize the WillClaw home directory:

```bash
node packages/cli/dist/index.js init
```

This creates a local home at `~/.willclaw` with:

- `config.yaml`
- `.env`
- `workspace/`
- `logs/`
- `data/`
- `historyMessages/`

3. Check status:

```bash
node packages/cli/dist/index.js status
node packages/cli/dist/index.js agents
node packages/cli/dist/index.js doctor
```

4. Start the local server:

```bash
node packages/cli/dist/index.js start
```

5. Open the Web UI:

```text
http://127.0.0.1:8420
```

## First-Time Configuration

The generated config lives at:

- `~/.willclaw/config.yaml`
- `~/.willclaw/.env`

The default config is intentionally broad. Before using WillClaw seriously, adjust it to match the agents and providers you actually have installed.

### Minimal `.env` example

```bash
ANTHROPIC_API_KEY=your_api_key_here
# Optional: if set, the Web UI requires auth
WILLCLAW_AUTH_TOKEN=wc_change_me
```

### Agent configuration

The generated `config.yaml` includes:

- a default agent
- route-specific agent preferences
- an `agents.pool` section describing each backend

If you mainly want to use a single coding agent, point both the default and routing entries at that agent. For example, a Codex-centric setup can route `coding`, `read_only_coding`, and `simple_qa` to `codex`.

### Workspace prompt files

WillClaw creates editable prompt/bootstrap files in `~/.willclaw/workspace`, including:

- `IDENTITY.md`
- `AGENTS.md`
- `RULES.md`
- `WORK_MODES.md`
- `MEMORY.md`
- `HEARTBEAT.md`
- `PROJECT_HEARTBEAT.md`

These files are assembled into agent prompts depending on context. You can also append extra Markdown files through `workspace.include_files` in `config.yaml`.

## Authentication And Pairing

Authentication is only enforced if you configure at least one valid bearer token.

- If no auth token is configured, the Web UI opens directly.
- If auth is enabled, the Web UI can be unlocked with a bearer token.
- If pairing is enabled, the Web UI can also be unlocked with a one-time pairing code.

Create a pairing code for Web login:

```bash
node packages/cli/dist/index.js pair create --kind web
```

Then paste the generated code into the unlock screen.

Pairing is also available for channel users via `/pair <code>` after the relevant channel is enabled.

## Hosted Tools

WillClaw can expose host tools to agents:

- Terminal
- Filesystem
- Browser
- Screen
- Memory Search

Check which host providers are available on the current machine:

```bash
node packages/cli/dist/index.js doctor
```

Notes:

- Browser support can use structured automation via `agent-browser`
- Browser fallback can use `system-open` for plain URL opening
- Screen tooling commonly relies on providers such as `peekaboo` and `screencapture`

## Optional Channel Integrations

WillClaw can expose the same runtime through:

- Telegram
- Discord
- Feishu

To enable a channel:

1. Set the required secrets in `~/.willclaw/.env`
2. Flip the channel’s `enabled` flag in `~/.willclaw/config.yaml`
3. Restart WillClaw

## CLI Overview

```bash
node packages/cli/dist/index.js init
node packages/cli/dist/index.js start
node packages/cli/dist/index.js status
node packages/cli/dist/index.js agents
node packages/cli/dist/index.js doctor
node packages/cli/dist/index.js logs
node packages/cli/dist/index.js sync-skills
node packages/cli/dist/index.js pair --help
node packages/cli/dist/index.js launch-agent --help
```

Useful examples:

```bash
# show recent app logs
node packages/cli/dist/index.js logs --no-follow

# show tool execution logs
node packages/cli/dist/index.js logs --tool --no-follow

# create a one-time web pairing code
node packages/cli/dist/index.js pair create --kind web

# install macOS auto-start
node packages/cli/dist/index.js launch-agent install
```

## How To Use It Day To Day

The typical flow is:

1. Start the runtime
2. Open the Web UI
3. Create or open a conversation
4. Choose `Auto` or a specific agent such as `codex`
5. Send a prompt
6. Use the runtime inspector for auth, pairing, provider health, logs, and host lab actions

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm typecheck
```

## Troubleshooting

- `status` tells you whether the home directory and config are valid
- `agents` shows whether configured agent commands are actually available
- `doctor` shows browser/screen provider health
- `logs` shows app logs and tool execution logs

If the Web UI says it is locked:

- check whether `WILLCLAW_AUTH_TOKEN` or other auth tokens are configured
- create a pairing code with `pair create --kind web`
- make sure pairing is enabled in `config.yaml`

If an agent route is selected but nothing useful happens:

- confirm the agent exists in `agents.pool`
- run `agents` to confirm the backend is available locally
- adjust `agents.default` and `agents.routing` to match your machine

## Current Status

WillClaw is usable, but it is still an actively evolving project. Expect the configuration surface and integration details to keep improving as the runtime, Web shell, and hosted-tool workflows mature.
