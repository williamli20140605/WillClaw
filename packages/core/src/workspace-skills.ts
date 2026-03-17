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
- LaunchAgent login auto-start commands

Current non-goals or not-yet-done areas:
- full Web UI frontend
- channel-facing undo/edit UX
- full macOS automation beyond minimal host tools

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

Telegram behavior:
- reads token from the configured env var
- supports owner / allowlist gating
- can require mention in groups
- private chats are handled directly
- inbound text is sent to ChatService
- assistant replies are pushed back to Telegram

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
- otherwise WillClaw uses heuristics for coding vs long-context vs simple QA
- read-only requests may fallback across the configured chain
- mutating fallback stays disabled unless config explicitly enables it

Tool exposure policy:
- \`native\` means the backend already has the ability; do not expose a duplicate hosted tool
- \`hosted\` means WillClaw may expose its own host-side tool
- \`disabled\` means do not expose that tool

Default intent:
- CLI coding agents keep terminal/filesystem as \`native\`
- API-driven agents use hosted terminal/filesystem when enabled
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

Audit rule:
- every WillClaw-owned host tool call must write to the tool log database and the app log

Provider priority:
- browser: \`agent-browser\` first, \`system-open\` as fallback
- screen: \`peekaboo\` first, \`screencapture\` as fallback

Behavior notes:
- provider attempts may fallback when the preferred binary is missing or fails
- CLI agents with native terminal/filesystem should not receive duplicate hosted copies
- browser and screen are host capabilities; they are not assumed to exist inside every backend session
- for provider-specific workflows, read the narrower \`agent-browser\` or \`peekaboo\` skill`,
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

Notes:
- requires Screen Recording and Accessibility permissions
- treat it as the first-choice screen provider on macOS
- if the binary is missing or the command fails, WillClaw may fallback to \`screencapture\``,
    },
    {
        slug: 'willclaw-http-api',
        title: 'willclaw-http-api',
        description:
            'Use when editing the Hono server, REST routes, status payloads, search endpoints, or tool-log endpoints.',
        body: `# HTTP API

Current REST surface includes:
- \`/health\`
- \`/api/status\`
- \`/api/agents\`
- \`/api/tools/catalog\`
- \`/api/prompt-preview\`
- \`/api/chat\`
- \`/api/runs/:runId\`
- \`/api/runs/:runId/cancel\`
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
- \`/api/logs/tools\`
- \`/api/logs/tools/stats\`
- \`/api/logs/tools/:id\`

Behavior notes:
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
