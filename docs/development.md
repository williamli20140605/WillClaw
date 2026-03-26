# Development

This guide is for contributors working inside the WillClaw repository.

## Monorepo Layout

```text
packages/core  runtime, API, orchestration, tools, channels
packages/cli   command-line wrapper and LaunchAgent helpers
packages/web   React UI and build scripts
```

Top-level scripts:

```bash
pnpm build
pnpm test
pnpm lint
pnpm typecheck
```

## Local Dev Loop

Typical loop:

```bash
pnpm install
pnpm build
node packages/cli/dist/index.js init
node packages/cli/dist/index.js start
```

Open the UI at:

```text
http://127.0.0.1:8420
```

## Useful Checks

### Typecheck

```bash
pnpm typecheck
```

### Lint

```bash
pnpm lint
```

### Tests

```bash
pnpm test
```

This currently runs the core and web test suites.

### Build

```bash
pnpm build
```

This builds:

- `@willclaw/core`
- `@willclaw/cli`
- `@willclaw/web`

## Runtime Debugging

Useful commands:

```bash
node packages/cli/dist/index.js status
node packages/cli/dist/index.js agents
node packages/cli/dist/index.js doctor
node packages/cli/dist/index.js logs --no-follow
node packages/cli/dist/index.js logs --tool --no-follow
```

These are usually faster than immediately attaching a debugger.

## Editing Guidelines

At the project level, the codebase has leaned toward these patterns:

- keep the core runtime logic in `packages/core`
- let the CLI stay thin and operational
- let the Web UI reuse REST and SSE rather than invent parallel transport
- preserve auditability for WillClaw-owned actions
- prefer agent-native capabilities before hosted duplicates

## Important Code Areas

### Config And Startup

- `packages/core/src/config.ts`
- `packages/core/src/paths.ts`
- `packages/core/src/workspace.ts`
- `packages/core/src/runtime.ts`
- `packages/core/src/app.ts`

### Agent Routing And Prompting

- `packages/core/src/orchestrator.ts`
- `packages/core/src/prompt.ts`
- `packages/core/src/tool-policy.ts`

### HTTP And Auth

- `packages/core/src/server.ts`
- `packages/core/src/auth.ts`
- `packages/core/src/pairing.ts`

### Chat And Memory

- `packages/core/src/chat-service.ts`
- `packages/core/src/memory.ts`
- `packages/core/src/workspace-memory.ts`
- `packages/core/src/memory-search.ts`

### Hosted Tools

- `packages/core/src/tools/browser.ts`
- `packages/core/src/tools/screen.ts`
- `packages/core/src/tool-logger.ts`
- `packages/core/src/provider-health.ts`

### Channels

- `packages/core/src/channels/telegram.ts`
- `packages/core/src/channels/discord.ts`
- `packages/core/src/channels/feishu.ts`
- `packages/core/src/channels/shell-commands.ts`

### Web UI

- `packages/web/src/App.tsx`
- `packages/web/src/use-shell-controller.ts`
- `packages/web/src/use-shell-state.ts`
- `packages/web/src/conversation-actions.ts`
- `packages/web/src/shell-loaders.ts`
- `packages/web/src/components/*`

## Common Change Patterns

### Add A New REST Endpoint

1. add schema and route in `server.ts`
2. connect it to runtime services rather than duplicating logic
3. update the Web UI or CLI consumer
4. add tests
5. update docs

### Add A New Hosted Tool Action

1. define the action in the relevant tool
2. expose it through server routes if needed
3. wire it into provider health and tool logs
4. expose it in the UI only when healthy and configured
5. document it

### Add A New Agent Type

1. define config schema
2. implement backend adapter
3. register it in backend factory
4. define output normalization and tool policy expectations
5. update docs and tests

## Testing Advice

Focus tests around:

- routing decisions
- auth and pairing edge cases
- queue and stale-response behavior
- channel identity mapping
- hosted tool provider fallback and health
- workspace memory date/path handling

These have historically been the most bug-prone surfaces.

## Docs Hygiene

If you change:

- API routes
- config schema
- tool capabilities
- auth semantics
- routing behavior

then update:

- root `README.md`
- relevant `docs/*.md`
- generated workspace skills when applicable

Generated workspace skills are runtime-facing; `docs/` is human-facing project documentation.
