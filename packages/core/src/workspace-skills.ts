import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

interface GeneratedWorkspaceSkill {
    slug: string;
    title: string;
    description: string;
    body: string;
}

export interface SyncWorkspaceSkillsOptions {
    workspaceDir: string;
    overwrite?: boolean;
}

export interface SyncWorkspaceSkillsResult {
    workspaceDir: string;
    skillsDir: string;
    filesWritten: string[];
}

const GENERATED_SKILLS: GeneratedWorkspaceSkill[] = [
    {
        slug: 'willclaw-self',
        title: 'willclaw-self',
        description:
            'Use when the task is about WillClaw itself: identity, current scope, repo structure, or deciding whether a feature already exists.',
        body: `# WillClaw Self

You are WillClaw: a lightweight orchestration layer around external coding agents.

Current implemented scope:
- TypeScript + Node.js + pnpm monorepo
- config loading and validation
- workspace bootstrap directory creation
- prompt assembly from workspace markdown files
- agent backends for Claude Code, Codex, OpenCode, Gemini, Direct API, and ACP
- orchestrator routing + explicit \`@agent\` selection + read-only fallback chain
- CLI output normalization for text, structured JSON, and event-stream style backends
- SQLite message storage + FTS search
- markdown history export
- command completion monitor
- Hono REST API
- audited host tools
- run lifecycle API
- heartbeat + cron runner
- workspace memory indexing, daily notes, and MEMORY.md compaction
- scheduled daily note + scheduled MEMORY.md compact maintenance
- Telegram polling channel adapter
- Discord message adapter
- Feishu webhook adapter
- React-based Web UI served from the Hono server root
- SSE event hub for realtime UI updates
- CLI-backed, direct-api, and ACP streaming previews over SSE before the final assistant message is persisted
- per-chat queued message execution so one thread is processed in order instead of racing concurrent runs
- agent-facing hosted browser/screen bridge for narrow WillClaw-owned actions
- shared auth manager for REST + ACP + Web UI session issuance
- managed bearer tokens persisted hashed-at-rest with create/revoke flows
- intent-aware router heuristics for hosted tools, read-only coding, and mode hints
- hosted screen OCR via Apple Vision, available through REST, Web UI, and the narrow hosted bridge
- minimal macOS app control via the screen/desktop bridge: frontmost app inspection, app open, and app activate
- higher-level browser inspection via \`inspect_page\`
- higher-level browser form workflow via \`fill_form\`
- minimal ACP server with list/get/run endpoints, sync+stream+async modes, and bearer-token auth
- LaunchAgent login auto-start commands

Current non-goals or not-yet-done areas:
- full WebSocket transport
- channel-facing undo/edit UX
- full macOS automation beyond the current hosted browser/screen action set

Design rules:
- keep the core small
- prefer agent-native abilities before adding hosted duplicates
- preserve auditability for any WillClaw-owned action
- when code and docs disagree, trust code first and then sync the workspace skills`,
    },
    {
        slug: 'willclaw-runtime',
        title: 'willclaw-runtime',
        description:
            'Use when working on startup, config, home/workspace layout, CLI commands, or runtime wiring.',
        body: `# Runtime

WillClaw currently boots a local home with:
- \`config.yaml\`
- \`workspace/\`
- \`historyMessages/\`
- \`logs/\`
- \`data/\`

Important runtime pieces:
- config schema + path expansion
- init/start/status CLI entrypoints
- launch-agent install/uninstall/status/print CLI entrypoints
- provider doctor checks for browser and screen integrations
- app logger
- prompt assembler
- orchestrator
- memory store
- tool logger
- shell/filesystem/browser/screen host tools
- channel manager
- background task engine
- scheduler
- workspace memory manager
- bundled web UI assets served from the HTTP server root
- optional ACP server on a separate port when \`acp.server.enabled\` is true

Notes:
- \`init\` should be safe and repeatable
- generated workspace skills are seeded automatically for the default workspace
- explicit skill sync can target another workspace directory when needed`,
    },
    {
        slug: 'willclaw-channels',
        title: 'willclaw-channels',
        description:
            'Use when working on chat channel adapters, Telegram polling, inbound message gating, or reply delivery.',
        body: `# Channels

Current channel work is gateway-style: one WillClaw process owns runtime state, channel adapters, chat handling, and persistence.

Implemented today:
- channel adapter interface
- channel manager
- Telegram polling adapter
- Discord adapter
- Feishu webhook adapter
- outbound channel notifications for heartbeat / cron results
- shared channel shell commands: \`/status\`, \`/queue\`, \`/undo\`, \`/edit\`, \`/resend\`, \`/cancel\`, \`/heartbeat\`, \`/cron\`

Telegram behavior:
- reads token from the configured env var
- supports owner / allowlist gating
- supports one-time \`/pair <code>\` onboarding without editing static allowlists
- can require mention in groups
- private chats are handled directly
- inbound text is sent to ChatService
- assistant replies are pushed back to Telegram
- shell commands can inspect status, inspect the current queue, revoke the latest user turn, edit and resend it, resend it unchanged, cancel the latest active run, or trigger heartbeat / cron work
- Telegram edited messages can be translated into the same logical edit flow instead of being treated as a brand-new user turn
- if a new message arrives while the same chat already has pending work, Telegram sends an immediate queued notice before the final reply
- background task notifications can be pushed to Telegram via the channel manager

Discord behavior:
- reads token from the configured env var
- DMs are handled directly
- guild messages default to mention-gated handling
- shell commands reuse the same channel command router as Telegram
- replies are sent back to the originating text channel or DM
- supports one-time \`/pair <code>\` onboarding for newly invited Discord users
- Discord message updates can be translated into the same logical edit flow instead of being treated as a brand-new user turn
- queued chats get an immediate "Queued behind N run(s)" acknowledgement before the final reply

Feishu behavior:
- receives event callbacks on \`/api/channels/feishu/events\`
- supports Feishu URL verification challenge
- verifies the configured verification token when present
- validates \`x-lark-signature\` freshness and rejects replayed signed requests when an encrypt key is configured
- handles unencrypted \`im.message.receive_v1\` text events
- p2p chats are handled directly
- group chats can be mention-gated
- replies are sent back as message replies through the Feishu IM API
- supports one-time \`/pair <code>\` onboarding for newly invited Feishu users
- queued chats get an immediate "Queued behind N run(s)" acknowledgement before the final reply

Design rules borrowed from OpenClaw-style gateways:
- channel enablement is config-driven
- each chat keeps its own \`channel + chatId\`
- access control should happen before model work
- one broken channel must not stop the whole WillClaw process`,
    },
    {
        slug: 'willclaw-routing',
        title: 'willclaw-routing',
        description:
            'Use when changing agent selection, prompt assembly, backend adapters, routing, or tool exposure policy.',
        body: `# Routing And Agents

Supported agents:
- \`claude-code\`
- \`codex\`
- \`opencode\`
- \`gemini\`
- \`direct-api\`
- \`acp\`

Routing behavior:
- \`@agent-name\` in user text forces an explicit backend
- otherwise WillClaw uses intent-aware heuristics for hosted tools vs read-only coding vs long-context vs coding vs simple QA
- routing reasons currently include \`explicit\`, \`mode_hint\`, \`hosted_tools\`, \`long_context\`, \`read_only_coding\`, \`coding\`, and \`simple_qa\`
- mode hints can bias routing toward hosted-tool or research-style backends without forcing a specific agent name
- read-only requests may fallback across the configured chain
- mutating fallback stays disabled unless config explicitly enables it
- JSON-oriented CLI backends such as \`opencode\` and \`gemini\` should have their structured/event-stream stdout normalized before it becomes assistant message content

Tool exposure policy:
- \`native\` means the backend already has the ability; do not expose a duplicate hosted tool
- \`hosted\` means WillClaw may expose its own host-side tool
- \`disabled\` means do not expose that tool

Default intent:
- CLI coding agents keep terminal/filesystem as \`native\`
- API-driven agents use hosted terminal/filesystem by default
- API-driven agents may also use hosted browser/screen bridges when policy allows
- WillClaw-owned \`memory_search\` is a hosted shell capability, not a generic MCP layer
- browser/screen stay explicitly policy-driven instead of assumed`,
    },
    {
        slug: 'willclaw-memory-history',
        title: 'willclaw-memory-history',
        description:
            'Use when changing chat persistence, message search, history export, completion notifications, or command-run auditing.',
        body: `# Memory And History

Message flow:
1. save the user message in SQLite
2. dispatch through the orchestrator
3. save the assistant reply
4. save command-run metadata
5. append markdown history export
6. optionally emit a system completion message for background CLI runs

Implemented storage:
- \`messages\` table
- \`command_runs\` table
- \`indexed_files\` table
- FTS5-backed message search
- FTS5-backed workspace file search for \`MEMORY.md\` and \`memory/*.md\`

Implemented exports:
- \`historyMessages/<channel>/<date>_<chat>.md\`

Implemented memory maintenance:
- run lifecycle state: cancel / revoke / edit / resend
- per-chat message queueing with queued run state and sequential execution
- workspace memory reindex
- daily note ensure + generate
- MEMORY.md compact/update
- scheduled maintenance tasks for daily note + MEMORY compact
- combined memory search across messages and indexed files
- built-in \`/search\` command
- agent-facing \`memory_search\` bridge for hosted WillClaw memory

Important constraints:
- history markdown is a human-readable export, not the source of truth
- SQLite is the source of truth for search and future revoke semantics
- completion messages are intended for background work, not duplicate foreground echoes`,
    },
    {
        slug: 'willclaw-host-tools',
        title: 'willclaw-host-tools',
        description:
            'Use when working on host-side tools, tool execution logging, or browser/screen provider selection.',
        body: `# Host Tools

Current hosted tools:
- shell
- filesystem
- browser
- screen
- memory_search

Current browser actions:
- open URL
- accessibility snapshot
- click
- type / fill
- screenshot
- inspect page in one step: open + snapshot + optional screenshot
- fill a form in one step: open + populate fields + optional submit + snapshot

Current screen / desktop actions:
- capture screenshot
- OCR text from the current screen or a captured image
- inspect the frontmost app
- open an app
- activate an app
- see / inspect UI elements
- click
- type
- press keys

Agent-facing bridge:
- WillClaw can expose browser/screen as a narrow hosted bridge
- the agent must answer with exactly one \`WILLCLAW_HOSTED_ACTION {...}\` line
- WillClaw executes the action, appends the result as a system message, and the agent continues
- this is intentionally narrower than generic MCP or shell/file bridges
- only actions that are currently healthy should be exposed to the selected agent

Audit rule:
- every WillClaw-owned host tool call must write to the tool log database and the app log

Provider priority:
- browser: \`agent-browser\` first, \`system-open\` as fallback
- screen: \`peekaboo\` first, \`screencapture\` as fallback

Behavior notes:
- provider attempts may fallback when the preferred binary is missing or fails
- CLI agents with native terminal/filesystem should not receive duplicate hosted copies
- browser and screen are host capabilities; they are not assumed to exist inside every backend session
- structured browser actions depend on \`agent-browser\`; \`system-open\` is only a coarse fallback for URL open
- \`inspect_page\` is the first higher-level browser workflow: open the page, snapshot it, and optionally attach a screenshot in one hosted step
- \`fill_form\` is the next higher-level browser workflow: open the page, fill multiple fields, optionally submit, then return an updated snapshot
- structured desktop vision/actions depend on \`peekaboo\`; \`screencapture\` is only a coarse fallback for screenshot capture, while OCR uses Apple Vision through \`xcrun swift\`
- app open / activate / frontmost inspection use macOS system APIs directly through \`open\` and AppleScript
- \`inspect_app\` is the first higher-level desktop workflow: foreground an app, capture the visible screen, then OCR it in one hosted step
- provider health can be checked from the CLI and HTTP API before relying on agent-browser or peekaboo
- for provider-specific workflows, read the narrower \`agent-browser\` or \`peekaboo\` skill`,
    },
    {
        slug: 'willclaw-hosted-bridge',
        title: 'willclaw-hosted-bridge',
        description:
            'Use when deciding which agents should use the narrow hosted browser/screen bridge, or when editing that bridge behavior.',
        body: `# Hosted Browser / Screen Bridge

WillClaw may expose a narrow hosted bridge for browser and screen actions.

What it is:
- agent replies with exactly one \`WILLCLAW_HOSTED_ACTION {...}\` line
- WillClaw executes the hosted browser/screen action
- WillClaw appends the result as a system message
- the agent continues and produces the final answer

What it is not:
- not generic MCP
- not a shell/filesystem bridge
- not meant to replace agent-native coding abilities

Current default usage by backend type:
- CLI coding agents (\`claude-code\`, \`codex\`, \`opencode\`, \`gemini\`):
  - \`shell/filesystem = native\`
  - \`browser/screen = disabled\`
  - do not force the bridge onto agents that already excel inside their own coding loop
- API agents (\`direct-api\`):
  - \`shell/filesystem = hosted\`
  - \`browser/screen = hosted\`
  - this is the main target for the hosted bridge today
- ACP agents:
  - browser/screen stay disabled by default unless a future ACP-specific design proves necessary
  - ACP responses may stream over SSE or NDJSON, and WillClaw should surface deltas when available

Bridge rules:
- only expose capabilities the selected agent actually needs
- only expose actions that are currently healthy according to provider doctor results
- route intent matters: hosted-tool requests are good fits for the bridge, while ordinary CLI coding loops are not
- prefer the smallest possible action payload
- use browser/session continuity within one run when possible
- keep artifacts and outputs auditable through WillClaw tool logs
- reject hosted actions that fall outside the current allowed action list
- if a provider fails, return the failure to the agent as system context instead of hiding it

Good fits:
- \`direct-api\` heartbeat / cron tasks that need browser inspection
- shell-side tasks that can use a single \`inspect_page\` step instead of manually chaining open/snapshot/screenshot
- shell-side tasks that need a hosted login/search/form-submission step without manually chaining multiple browser commands
- shell-side research helpers that need hosted screenshots
- shell-side research helpers that need OCR from the host desktop
- shell-side tasks that need to foreground Finder, Terminal, or another macOS app before taking the next hosted action
- shell-side tasks that can use a single \`inspect_app\` step instead of manually chaining activate/capture/ocr
- future channel commands that need WillClaw-owned browser or desktop actions

Bad fits:
- general coding loops for CLI agents
- replacing \`Exec / Read / Write / Edit\`
- broad autonomous desktop control without explicit policy`,
    },
    {
        slug: 'agent-browser',
        title: 'agent-browser',
        description:
            'Use when WillClaw needs structured hosted browser automation, provider installation steps, or browser smoke tests.',
        body: `# Agent Browser

Use this skill when WillClaw needs a real hosted browser provider instead of the coarse \`system-open\` fallback.

Role in WillClaw:
- preferred browser provider before \`system-open\`
- best fit for direct-api, heartbeat, or web-triggered browser tasks
- better than \`system-open\` when structured browser automation or future DOM-level actions are needed

Install on macOS:
- \`brew install agent-browser\`
- \`agent-browser install\`

Alternative install:
- \`npm install -g agent-browser\`
- \`agent-browser install\`

Verify:
- \`agent-browser --help\`
- \`agent-browser open https://example.com\`
- \`agent-browser snapshot -i --json\`

Useful commands:
- \`agent-browser open <url>\`
- \`agent-browser open <url> --headed\`
- \`agent-browser snapshot -i --json\`
- \`agent-browser click @e2\`
- \`agent-browser type @e3 "hello"\`
- \`agent-browser screenshot\`

Notes:
- \`agent-browser install\` downloads Chrome for Testing
- if the binary is missing or the command fails, WillClaw may fallback to \`system-open\`
- prefer this skill whenever the task needs more than “just open a URL”`,
    },
    {
        slug: 'peekaboo',
        title: 'peekaboo',
        description:
            'Use when WillClaw needs hosted screen capture, macOS GUI inspection, provider installation, or screenshot smoke tests.',
        body: `# Peekaboo

Use this skill when WillClaw needs a real macOS screen provider instead of the raw \`screencapture\` fallback.

Role in WillClaw:
- preferred screen provider before \`screencapture\`
- good for screen capture, desktop inspection, and future GUI automation

Install on macOS:
- \`brew install steipete/tap/peekaboo\`
- \`peekaboo permissions status\`
- \`peekaboo permissions grant\`

Alternative install:
- \`npx -y @steipete/peekaboo\`

Verify:
- \`peekaboo --help\`
- \`peekaboo image --mode screen --retina --path /tmp/peekaboo-test.png\`

Useful commands:
- \`peekaboo permissions status\`
- \`peekaboo permissions grant\`
- \`peekaboo image --mode screen --retina --path <file>\`
- \`peekaboo see --app Terminal --annotate --json\`
- \`peekaboo click --id B1 --app Terminal --json\`
- \`peekaboo type "hello" --app Terminal --json\`

Notes:
- requires Screen Recording and Accessibility permissions
- treat it as the first-choice screen provider on macOS
- if the binary is missing or the command fails, WillClaw may fallback to \`screencapture\``,
    },
    {
        slug: 'willclaw-web-ui',
        title: 'willclaw-web-ui',
        description:
            'Use when working on the React front end, static bundle build, dashboard layout, or browser-facing chat/search/task flows.',
        body: `# Web UI

Current implementation:
- React frontend in \`packages/web\`
- esbuild bundle output copied to \`packages/web/dist\`
- Hono serves the bundle at \`/\`, \`/styles.css\`, \`/favicon.svg\`, and \`/assets/*\`

Current UI scope:
- chat-first three-column layout: conversations, main thread, inspector
- multi-thread web conversation list powered by \`/api/chats\`
- web-channel chat composer
- message timeline for the selected \`channel=web\` thread
- queued vs running state for active runs in the current thread
- runtime queue panel for the selected thread
- assistant / system markdown rendering with code blocks, lists, tables, and quotes
- revoke / edit / resend controls for user messages
- inspector tabs for memory search, activity, and runtime state
- scheduler trigger buttons
- recent tool log panel scoped to the current chat
- agent and host-tool status summary
- runtime host lab for browser open/snapshot/screenshot and screen inspect/capture/OCR
- runtime host lab can also run browser \`inspect page\` for one-step open + snapshot (+ screenshot)
- runtime host lab can also run browser \`fill form\` with JSON field definitions
- runtime host lab can also run \`inspect app\` for one-step foreground + capture + OCR
- SSE-backed realtime connection, active runs, and recent event stream
- live streaming preview bubble for CLI and direct-api runs before the final assistant message lands
- active run cancel action in the conversation header
- composer route preview via \`/api/route-preview\`
- activity tab now shows route selection, agent attempts, and fallback events in human-readable form
- edited / revoked message lineage is visible in the timeline with \`edited from\` and \`superseded by\` cues
- conversation titles and previews prefer real user/assistant content instead of the latest system note
- auth-aware Web UI boot: protected workspaces show an unlock screen first, then switch to an HttpOnly session cookie for API + SSE access
- authenticated shells show the active token identity in the top bar and allow explicit logout
- runtime inspector includes a Pairing panel for minting one-time web/channel invites and checking current grants
- runtime inspector includes an Auth panel for token metadata, managed token create/revoke, and active session revocation when the session carries \`api:session\`

Current limits:
- not every host-side event is streamed yet
- fallback polling still exists as a safety net

When changing this area:
- keep the UI shell-centric, not IDE-centric
- prefer existing REST APIs before inventing new ones
- preserve mobile usability and intentional visual direction`,
    },
    {
        slug: 'willclaw-http-api',
        title: 'willclaw-http-api',
        description:
            'Use when editing the Hono server, REST routes, status payloads, search endpoints, or tool-log endpoints.',
        body: `# HTTP API

Current REST surface includes:
- \`/health\`
- \`/\` (Web UI)
- \`/api/auth/status\`
- \`/api/auth/session\`
- \`/api/auth/pairing\`
- \`/api/auth/tokens\`
- \`/api/auth/tokens/:tokenId\`
- \`/api/auth/sessions\`
- \`/api/auth/sessions/:sessionId\`
- \`/api/pairing\`
- \`/api/pairing/invites\`
- \`/api/pairing/invites/:inviteId/revoke\`
- \`/api/pairing/grants/:grantId/revoke\`
- \`/api/status\`
- \`/api/agents\`
- \`/api/tools/catalog\`
- \`/api/providers/health\`
- \`/api/events\`
- \`/api/route-preview\`
- \`/api/prompt-preview\`
- \`/api/chat\`
- \`/api/runs/:runId\`
- \`/api/runs/:runId/cancel\`
- \`/api/chats\`
- \`/api/queues\`
- \`/api/messages\`
- \`/api/messages/:id/revoke\`
- \`/api/messages/:id/edit\`
- \`/api/messages/:id/resend\`
- \`/api/search\`
- \`/api/memory/search\`
- \`/api/memory/reindex\`
- \`/api/memory/daily-note/ensure\`
- \`/api/memory/daily-note/generate\`
- \`/api/memory/compact\`
- \`/api/cron\`
- \`/api/heartbeat/run\`
- \`/api/cron/:taskName/run\`
- \`/api/maintenance/:taskName/run\`
- \`/api/tools/browser/*\`
- \`/api/tools/browser/inspect-page\`
- \`/api/tools/browser/fill-form\`
- \`/api/tools/screen/*\`
- \`/api/tools/screen/inspect-app\`
- \`/api/logs/tools\`
- \`/api/logs/tools/stats\`
- \`/api/logs/tools/:id\`

Behavior notes:
- \`/\` now serves the bundled Web UI when \`packages/web/dist\` exists
- REST auth is scope-based: separate tokens can target read/write/tools/events/acp, while the Web UI upgrades a bearer token into an HttpOnly session cookie
- managed bearer tokens can be created and revoked through the API; they are stored hashed at rest and only returned in plain text at creation time
- sessions minted from bearer-token login now retain \`api:session\` so the browser shell can inspect token metadata, mint/revoke managed tokens, and revoke active sessions when appropriate
- pairing invites are hashed at rest, can be revoked, and can be redeemed either from the Web UI unlock gate or via channel-side \`/pair <code>\`
- API + ACP requests are protected by in-memory rate limiting when auth is enabled
- Feishu webhooks can validate \`x-lark-signature\`, enforce signature freshness, and reject replayed requests when an encrypt key is configured
- \`/api/chat\` now handles built-in \`/search\` without dispatching to a coding agent
- agent-facing \`memory_search\` is exposed as a narrow WillClaw bridge, not a generic MCP tool layer

Status payloads should expose:
- configured agents
- availability
- tool policy classification
- host tool provider order where relevant

When adding endpoints:
- keep responses simple JSON
- prefer runtime-backed data over duplicated caches
- preserve auth checks for \`/api/*\` when a bearer token is configured`,
    },
];

async function pathExists(targetPath: string): Promise<boolean> {
    try {
        await access(targetPath);
        return true;
    } catch {
        return false;
    }
}

async function writeGeneratedFile(
    targetPath: string,
    content: string,
    overwrite: boolean,
    filesWritten: string[],
): Promise<void> {
    if (!overwrite && (await pathExists(targetPath))) {
        return;
    }

    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, content, 'utf8');
    filesWritten.push(targetPath);
}

function renderSkillMarkdown(skill: GeneratedWorkspaceSkill): string {
    return `---
name: ${skill.title}
description: ${skill.description}
---

${skill.body}
`;
}

function renderSkillsOverview(): string {
    return `# WillClaw Skills

你是 WillClaw。

这份 workspace 的 \`skills/\` 目录描述的是当前已经落地的 WillClaw 能力，而不是未来设想。优先读取最窄、最相关的 skill，不要一次把所有 skill 都塞进上下文。

当前已落地的能力大类：
- 自身定位与实现边界
- runtime / config / init / CLI
- channel gateway / Telegram adapter
- agent routing 与 prompt 组装
- memory / history / completion monitor
- 宿主工具与 tool logs
- agent-browser / peekaboo provider skills
- Hono REST API

使用规则：
1. 先读 \`SKILLS_INDEX.md\`，选择最相关的 skill。
2. 遇到 \`native | hosted | disabled\` 工具分类时，优先尊重 agent-native-first 原则。
3. browser provider 默认优先 \`agent-browser\`，失败再退回 \`system-open\`。
4. screen provider 默认优先 \`peekaboo\`，失败再退回 \`screencapture\`。
5. 如果代码已经变了，而 skill 还没同步，先信代码，再刷新这些 skill 文件。`;
}

function renderSkillsIndex(workspaceDir: string): string {
    const lines = ['# WillClaw Skills Index', '', '按需加载下面这些 skill：', ''];

    for (const skill of GENERATED_SKILLS) {
        lines.push(`## ${skill.title}`);
        lines.push(
            `- Path: ${path.join(workspaceDir, 'skills', skill.slug, 'SKILL.md')}`,
        );
        lines.push(`- Use when: ${skill.description}`);
        lines.push('');
    }

    return lines.join('\n').trimEnd();
}

export async function syncWillClawWorkspaceSkills(
    options: SyncWorkspaceSkillsOptions,
): Promise<SyncWorkspaceSkillsResult> {
    const workspaceDir = path.resolve(options.workspaceDir);
    const skillsDir = path.join(workspaceDir, 'skills');
    const overwrite = options.overwrite ?? true;
    const filesWritten: string[] = [];

    await mkdir(skillsDir, { recursive: true });
    await writeGeneratedFile(
        path.join(workspaceDir, 'SKILLS.md'),
        renderSkillsOverview(),
        overwrite,
        filesWritten,
    );
    await writeGeneratedFile(
        path.join(workspaceDir, 'SKILLS_INDEX.md'),
        renderSkillsIndex(workspaceDir),
        overwrite,
        filesWritten,
    );

    for (const skill of GENERATED_SKILLS) {
        await writeGeneratedFile(
            path.join(skillsDir, skill.slug, 'SKILL.md'),
            renderSkillMarkdown(skill),
            overwrite,
            filesWritten,
        );
    }

    return {
        workspaceDir,
        skillsDir,
        filesWritten,
    };
}
