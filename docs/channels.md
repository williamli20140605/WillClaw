# Channels

WillClaw can expose the same core runtime through chat channels.

Currently supported:

- Telegram
- Discord
- Feishu

The browser shell is also treated as a channel internally, but this document focuses on the external adapters.

## Shared Channel Design

All channels reuse the same core pieces:

- auth-adjacent access checks
- pairing grants
- chat persistence
- per-chat queueing
- revoke/edit/resend/cancel flows
- heartbeat and cron trigger commands

Each channel keeps its own:

- `channel` name
- upstream `chatId`
- upstream `userId`

This lets WillClaw separate different threads even when they arrive from different platforms.

## Shared Command Layer

Channel adapters normalize certain commands through a shared shell-command layer.

Current command families include:

- `/status`
- `/queue`
- `/undo`
- `/edit`
- `/resend`
- `/cancel`
- `/heartbeat`
- `/cron`
- `/pair`

Important behavior:

- message mutation commands are now scoped to the issuing user, not blindly to the latest message in the chat
- queue-awareness is shared across channels

## Telegram

Telegram support is polling-based.

Capabilities:

- owner and allowlist gating
- one-time `/pair <code>` onboarding
- mention-gated group handling
- direct private-chat handling
- edited message mapping into the logical edit flow
- queued acknowledgements before final replies
- outbound background notifications

Relevant config:

```yaml
channels:
  telegram:
    enabled: false
    token_env: TELEGRAM_BOT_TOKEN
    owner_id: 0
    allowed_users: []
    require_mention_in_groups: true
    poll_timeout_seconds: 20
```

Environment:

```bash
TELEGRAM_BOT_TOKEN=...
```

## Discord

Discord support handles DMs and guild messages.

Capabilities:

- DM handling
- mention-gated guild handling
- one-time `/pair <code>` onboarding
- edited message mapping into logical edit flow
- queued acknowledgements
- reply routing back to channel or DM

Relevant config:

```yaml
channels:
  discord:
    enabled: false
    token_env: DISCORD_BOT_TOKEN
    owner_id: ""
    allowed_users: []
    require_mention_in_guilds: true
```

Environment:

```bash
DISCORD_BOT_TOKEN=...
```

## Feishu

Feishu support is webhook-based.

Capabilities:

- webhook event intake on `/api/channels/feishu/events`
- URL verification challenge
- verification token checks when configured
- signed-request freshness and replay protections when encrypt key is configured
- p2p direct chat handling
- optional mention-gated group handling
- one-time `/pair <code>` onboarding
- queued acknowledgements
- reply delivery through the Feishu IM API

Relevant config:

```yaml
channels:
  feishu:
    enabled: false
    app_id_env: FEISHU_APP_ID
    app_secret_env: FEISHU_APP_SECRET
    verification_token_env: FEISHU_VERIFICATION_TOKEN
    encrypt_key_env: FEISHU_ENCRYPT_KEY
    signature_max_skew_seconds: 300
    replay_window_seconds: 600
    owner_open_id: ""
    allowed_open_ids: []
    require_mention_in_groups: true
```

Environment:

```bash
FEISHU_APP_ID=...
FEISHU_APP_SECRET=...
FEISHU_VERIFICATION_TOKEN=...
FEISHU_ENCRYPT_KEY=...
```

## Pairing In Channels

Channels do not need to rely purely on hard-coded allowlists.

Flow:

1. admin creates a channel pairing invite
2. user sends `/pair <code>` in the channel
3. WillClaw verifies invite and channel match
4. WillClaw records a channel grant
5. future access checks accept that user in that channel

This is especially useful when:

- onboarding a new teammate
- allowing temporary access without config edits
- avoiding restarts just to update allowlists

## Message Editing Semantics

When a supported platform tells WillClaw that a user edited a message:

- WillClaw attempts to locate the corresponding local message via stored upstream message metadata
- if found, the change maps into the normal edit flow
- if not found, WillClaw avoids blindly editing the most recent local message

This matters because naive “edit the latest thing” behavior is wrong in busy chats.

## Queues And Busy Threads

Each chat thread is processed sequentially.

If a new request arrives while a previous one is still running:

- WillClaw queues the new run
- supported channels can send an immediate queued notice
- final assistant output arrives after earlier work finishes

This avoids cross-thread race conditions inside one chat.

## Channel Notifications

Background work such as heartbeat or cron tasks may notify channels through the channel manager.

This is useful for:

- daily summaries
- scheduled health checks
- maintenance notices

## Practical Rollout Advice

Start in this order:

1. get the Web shell working locally
2. enable auth and pairing
3. test one external channel in a low-risk environment
4. test queueing, edit, cancel, and pairing flows
5. only then expose it to a broader group

## Failure Isolation

One design rule is that one broken channel should not stop the whole WillClaw process.

Operationally that means:

- channel start should be explicit and inspectable
- channel-specific secrets should stay isolated in `.env`
- app logs should be your first stop when a channel behaves strangely
