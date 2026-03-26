# WillClaw Docs

This directory is the long-form documentation set for WillClaw.

If you are new to the project, read the docs in this order:

1. [Quick Start](./quick-start.md)
2. [Configuration](./configuration.md)
3. [Web UI](./web-ui.md)
4. [CLI](./cli.md)
5. [Architecture](./architecture.md)

Then use the topic guides as needed:

- [Authentication And Pairing](./auth-and-pairing.md)
- [Channels](./channels.md)
- [Hosted Tools](./hosted-tools.md)
- [Memory And Scheduler](./memory-and-scheduler.md)
- [HTTP API](./http-api.md)
- [ACP And Operations](./acp-and-operations.md)
- [Development](./development.md)

## What WillClaw Is

WillClaw is a local orchestration shell around coding agents. It combines:

- a local HTTP server and browser UI
- configurable agent backends
- prompt assembly from workspace Markdown files
- local and hosted tool exposure policies
- persistent chat and tool logs
- optional chat-channel gateways
- scheduled background tasks and memory maintenance

The codebase is a pnpm monorepo:

- `packages/core`: runtime, HTTP API, tools, auth, memory, channels
- `packages/cli`: CLI entrypoint and macOS LaunchAgent helpers
- `packages/web`: React UI served by the core server

## Current Runtime Defaults

- Web server: `127.0.0.1:8420`
- ACP server: `127.0.0.1:8421` when enabled
- Home directory: `~/.willclaw`
- Home layout:
  - `config.yaml`
  - `.env`
  - `workspace/`
  - `historyMessages/`
  - `logs/`
  - `data/`

## Core Concepts

- `Agent`: a backend such as `claude-code`, `codex`, `gemini`, `opencode`, `direct-api`, or an ACP endpoint
- `Route`: WillClaw’s decision about which agent should handle a request
- `Tool policy`: whether a tool is `native`, `hosted`, or `disabled` for a given agent
- `Hosted tool`: an action WillClaw runs on the local machine on behalf of an agent
- `Pairing`: a one-time invite flow for Web login or channel onboarding
- `Workspace bootstrap`: Markdown files in `~/.willclaw/workspace` that shape prompts and maintenance tasks

## Reading Notes

- These docs describe the code that exists today, not aspirational features.
- When docs and code diverge, code should win. The docs should then be updated.
- Browser, screen, and LaunchAgent functionality are currently most practical on macOS.
