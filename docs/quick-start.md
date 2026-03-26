# Quick Start

This guide gets a fresh checkout to a working local WillClaw instance.

## Requirements

- Node.js 20 or newer
- pnpm 10 or newer
- At least one agent backend available locally or via API

Common defaults in the generated config expect some of these to exist:

- `claude`
- `codex`
- `gemini`
- `opencode`
- `ANTHROPIC_API_KEY` for the `direct-api` backend

## 1. Install And Build

From the repository root:

```bash
pnpm install
pnpm build
```

WillClaw currently does not expose a root `pnpm start` script. The normal source-tree entrypoint is the built CLI:

```bash
node packages/cli/dist/index.js --help
```

If you want `willclaw` as a shell command during development:

```bash
cd packages/cli
npm link
```

After that:

```bash
willclaw --help
```

## 2. Initialize A Home Directory

Create the default home:

```bash
node packages/cli/dist/index.js init
```

Or create an isolated home for testing:

```bash
node packages/cli/dist/index.js init --home /tmp/willclaw-dev
```

Initialization is meant to be repeatable and safe. It creates the directory structure, writes a default `config.yaml` if needed, and seeds workspace bootstrap files.

Created layout:

```text
~/.willclaw/
  config.yaml
  .env
  workspace/
    IDENTITY.md
    AGENTS.md
    RULES.md
    WORK_MODES.md
    MEMORY.md
    HEARTBEAT.md
    PROJECT_HEARTBEAT.md
    SKILLS.md
    SKILLS_INDEX.md
    skills/
  historyMessages/
  logs/
  data/
```

## 3. Edit `config.yaml` And `.env`

Main files:

- `~/.willclaw/config.yaml`
- `~/.willclaw/.env`

Minimal `.env` example:

```bash
ANTHROPIC_API_KEY=your_api_key_here
WILLCLAW_AUTH_TOKEN=wc_change_me
```

The second line is optional. If you omit all auth tokens, the Web UI is not locked.

## 4. Sanity-Check Your Setup

Status:

```bash
node packages/cli/dist/index.js status
```

Configured agent availability:

```bash
node packages/cli/dist/index.js agents
```

Browser and screen provider health:

```bash
node packages/cli/dist/index.js doctor
```

What to expect:

- `status` should say config exists and is valid
- `agents` should show the backends you configured and whether they are available
- `doctor` should show browser and screen providers as healthy, degraded, or missing

## 5. Start The Runtime

```bash
node packages/cli/dist/index.js start
```

By default this:

- loads config and `.env`
- syncs workspace bootstrap docs and generated skills
- initializes auth, pairing, memory, logging, channels, tools, scheduler, and HTTP routes
- starts the Web server on `127.0.0.1:8420`
- starts enabled channels

To initialize runtime without binding the HTTP port:

```bash
node packages/cli/dist/index.js start --no-listen
```

## 6. Open The Web UI

Open:

```text
http://127.0.0.1:8420
```

If auth is disabled, the shell loads immediately.

If auth is enabled, the shell first shows an unlock screen. You can use:

- a bearer token with `api:session`
- a valid one-time pairing code when pairing is enabled

Generate a pairing code for Web login:

```bash
node packages/cli/dist/index.js pair create --kind web
```

## 7. Send A First Prompt

The normal UI flow is:

1. Open the Web shell
2. Create a new conversation
3. Choose `Auto`, `Default`, or a specific agent
4. Type a prompt
5. Watch the live route preview and streamed partial output

Good first prompts:

- `Read this repo and summarize how startup works.`
- `Use Codex and explain the current architecture.`
- `Search memory for anything about pairing bugs.`

## 8. Common Next Steps

- [Configuration](./configuration.md): customize agents, routing, tools, and schedules
- [Web UI](./web-ui.md): understand the shell and inspector
- [CLI](./cli.md): learn operational commands
- [Authentication And Pairing](./auth-and-pairing.md): lock down the Web shell safely

## Fast Troubleshooting

If the UI does not open:

- verify `start` is still running
- check that `server.host` and `server.port` are reachable
- check `node packages/cli/dist/index.js logs --no-follow`

If the UI opens but requests fail:

- run `status`
- run `agents`
- check whether the selected agent is actually installed

If browser or screen actions fail:

- run `doctor`
- read [Hosted Tools](./hosted-tools.md)
