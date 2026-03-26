# Web UI

WillClaw’s Web UI is a shell-first interface for interacting with configured agents and runtime services.

Default address:

```text
http://127.0.0.1:8420
```

## Purpose

The Web UI is not trying to be a full IDE. It is a runtime shell that lets you:

- create and revisit conversations
- select a specific agent or let WillClaw route automatically
- inspect run state and recent events
- trigger maintenance and runtime actions
- manage auth, sessions, and pairing when your session is allowed to
- inspect hosted tool and provider status

## Major Areas

The UI is organized around three main zones:

- conversation/sidebar area
- main thread area
- runtime inspector area

On smaller screens, the layout compresses and surfaces mobile-first thread controls near the conversation area.

## Boot Flow

There are two startup states:

### 1. Open shell

If auth is not enabled, the UI loads directly into the dashboard.

### 2. Unlock shell

If auth is enabled, the UI first shows an unlock screen.

Accepted unlock inputs:

- bearer token with `api:session`
- one-time pairing code when pairing is enabled

After successful login, the UI switches to an HttpOnly session cookie for API and SSE access.

## Conversations

The conversation system supports:

- multiple threads
- draft thread creation before the first message is persisted
- conversation titles and previews derived from real content
- per-thread run state
- edit, revoke, resend, and cancel controls

Important behavior:

- a chat is the unit of queueing
- one thread processes work sequentially
- different threads can still progress independently

## Composer

The composer is where most user interaction happens.

Features:

- explicit agent picker
- route preview for `Auto`
- execution mode selection
- normal prompt entry
- built-in `/search` handling through the API

Agent selection modes:

- `Auto`: use the router
- `Default`: use the configured default
- specific agent, such as `codex`

Selection behavior:

- current chat can keep its own explicit agent choice
- a global default agent preference can be persisted
- chat-level explicit selection overrides the default

## Route Preview

When using `Auto`, the UI can ask the server for a route preview before submission.

This helps explain:

- which agent is likely to run
- why that route was chosen
- whether the request looked like coding, hosted-tools, or another route class

The preview is informational, but it is meant to match the same routing logic used during real execution.

## Timeline

The thread view renders:

- user messages
- assistant messages
- system messages
- live preview content while runs are in progress

It also surfaces lineage markers such as:

- edited from
- superseded by
- revoked state

This makes mutation history visible instead of pretending the thread was always linear.

## Active Run Controls

The conversation header can show:

- current run state
- active queue information
- cancel action for the current run

This is especially important for:

- long-running CLI agents
- queued background work
- hosted tool workflows

## Inspector

The inspector is the runtime-control side of the UI.

It can expose:

- runtime status
- provider health
- auth sessions and managed tokens
- pairing invites and grants
- memory search
- activity and routing events
- host lab actions
- queue and scheduler state
- recent tool logs

## Auth Panel

When the current session has `api:session`, the inspector can:

- show token metadata
- list active sessions
- create managed tokens
- revoke sessions
- revoke managed tokens

If the session lacks that scope, the panel becomes read-only or limited.

## Pairing Panel

The pairing panel lets you:

- inspect whether pairing is enabled
- create one-time Web or channel invites
- list active invites
- revoke invites
- inspect current channel grants
- revoke grants

This is the main operational surface for safe onboarding after auth is enabled.

## Runtime Status And Activity

The status and activity views are meant to answer:

- which agents exist and whether they are available
- what tool policy each agent has
- whether browser and screen providers are healthy
- what route was chosen
- whether fallback happened
- what recent runtime events occurred

This is one of the places WillClaw distinguishes itself from a plain chat frontend: the system is supposed to remain inspectable.

## Host Lab

The Host Lab exposes manual hosted actions from the browser.

Current browser-side actions include:

- open URL
- snapshot
- inspect page
- fill form
- click
- type
- screenshot

Current screen-side actions include:

- capture
- see
- OCR
- click
- type
- press keys
- inspect frontmost app
- open app
- activate app
- inspect app
- send text

The UI now disables actions that are not healthy or not configured, rather than presenting them as blindly clickable.

## Mobile Behavior

The UI intentionally keeps core chat actions reachable on smaller screens.

Current mobile priorities:

- first-screen access to conversation controls
- first-screen access to the composer in draft chats
- reduced sticky header interference
- usable focus order for thread navigation

The UI is still shell-oriented rather than document-editor-oriented, so the goal is pragmatic usability more than desktop parity.

## Realtime Behavior

The Web UI uses SSE for:

- recent event streams
- streamed partial model output
- runtime updates

Polling still exists as a fallback safety net in some places.

## UI Design Principles

When editing the Web shell, current design intent is:

- shell-centric, not IDE-centric
- fast to scan
- explicit enough to debug routing/runtime decisions
- mobile-usable
- auth and runtime state visible

## Typical User Workflow

1. Unlock the shell if needed
2. Start a new conversation
3. Pick an agent or `Auto`
4. Send a prompt
5. Watch route preview and streaming output
6. Use edit or resend if needed
7. Check activity or host lab if the task touches hosted tools
