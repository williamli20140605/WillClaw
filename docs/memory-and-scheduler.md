# Memory And Scheduler

WillClaw tracks more than transient chat messages. It also maintains project memory and scheduled background tasks.

## Memory Layers

WillClaw memory spans several storage forms:

- SQLite message and run history
- FTS-backed message search
- indexed workspace memory files
- `MEMORY.md`
- daily notes under `workspace/memory/`
- markdown history exports

These layers serve different purposes.

## SQLite As Source Of Truth

The operational source of truth is the local SQLite database.

It stores:

- user, assistant, and system messages
- command runs
- indexed file metadata

Why it matters:

- search and lifecycle operations rely on it
- revoke and edit semantics depend on persisted lineage
- markdown export is secondary

## History Exports

WillClaw can export readable markdown history files into:

- `historyMessages/<channel>/...`

Use cases:

- human browsing
- lightweight archival
- external indexing

Current guidance:

- treat exports as derived artifacts
- do not assume they are the only or authoritative storage

## Workspace Memory

Workspace memory is the project-facing memory layer rooted in the WillClaw workspace.

Important files:

- `MEMORY.md`
- `workspace/memory/*.md`
- daily note files using `YYYY-MM-DD.md`

WillClaw can index and search this content.

## Reindexing

Memory indexing can happen automatically at start depending on config:

```yaml
memory:
  search_reindex_on_start: true
```

You can also trigger reindex manually through the API or Web UI.

## Daily Notes

Daily notes are a time-bucketed memory summary flow.

Current capabilities:

- ensure a daily note file exists
- generate daily note content via an agent
- schedule daily note generation

Relevant config:

```yaml
memory:
  daily_note:
    enabled: true
    schedule: "55 23 * * *"
    agent: direct-api
```

Important behavior:

- daily notes use validated `YYYY-MM-DD` keys
- date handling has been hardened against invalid paths and traversal issues
- note time windows are aligned to local date semantics rather than naive UTC slicing

## MEMORY Compaction

WillClaw can periodically compact or refresh `MEMORY.md`.

Relevant config:

```yaml
memory:
  compact:
    enabled: true
    schedule: "10 2 * * *"
    agent: direct-api
    limit: 200
```

This is useful when:

- chat history grows large
- the project needs a concise rolling memory
- you want a machine-maintained summary layer

## Search

There are two closely related search surfaces:

- message search through stored chat history
- workspace memory search through indexed memory files

WillClaw also supports a built-in `/search` command path for the chat experience.

## Message Lifecycle

WillClaw tracks more than append-only chat.

Supported lifecycle operations include:

- cancel
- revoke
- edit
- resend

This means memory and history need to understand lineage, not just final text blobs.

## Per-Chat Queueing

Each chat thread has queued execution semantics.

Why:

- prevents concurrent runs in the same thread from racing
- keeps edit/resend/cancel semantics coherent
- lets the UI and channels surface queued state clearly

## Scheduler

The scheduler is the runtime component that owns recurring jobs.

Task families include:

- heartbeat
- named cron jobs
- daily note generation
- memory compaction
- log maintenance

## Heartbeat

Heartbeat is a recurring prompt-driven task.

Typical use:

- workspace health check
- daily check-in
- regular summary

Config:

```yaml
heartbeat:
  enabled: true
  interval: "0 * * * *"
  agent: direct-api
  notify: telegram
  silent_ok: true
  inject_files:
    - HEARTBEAT.md
    - PROJECT_HEARTBEAT.md
```

## Named Cron Jobs

Custom recurring prompts live under `cron`.

Example:

```yaml
cron:
  daily_briefing:
    schedule: "0 8 * * *"
    agent: direct-api
    prompt: 生成今日简报
    notify: telegram
```

Use named cron jobs when you want:

- project-specific reminders
- regular reporting
- automated planning nudges

## Log Maintenance

Log retention is also scheduled.

Relevant config:

```yaml
logging:
  retain_days: 90
  retention_schedule: "25 3 * * *"
```

Current behavior includes:

- pruning old tool-log records
- rotating or compressing app logs as needed
- deleting expired supplemental log artifacts

## Manual Triggers

Many of these tasks can also be triggered manually through the API or Web UI.

Examples:

- run heartbeat now
- run a named cron now
- ensure or generate a daily note now
- compact memory now
- run log maintenance now

## Operational Advice

- keep background tasks on an agent that is stable and predictable
- avoid using an unreliable CLI coding agent for unattended scheduled work
- API-backed agents are often better fits for heartbeat and maintenance
- validate memory search quality after schema or indexing changes
