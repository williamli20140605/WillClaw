import { access, readFile } from 'node:fs/promises';

import { config as loadDotEnv } from 'dotenv';
import { parse } from 'yaml';
import { z } from 'zod';

import {
    expandHomeDir,
    getWillClawPaths,
    type WillClawPaths,
} from './paths.js';

export const HOST_TOOL_NAMES = [
    'shell',
    'filesystem',
    'browser',
    'screen',
] as const;
export const BROWSER_TOOL_PROVIDERS = ['agent-browser', 'system-open'] as const;
export const SCREEN_TOOL_PROVIDERS = ['peekaboo', 'screencapture'] as const;

export type HostToolName = (typeof HOST_TOOL_NAMES)[number];
export type AgentToolMode = 'native' | 'hosted' | 'disabled';
export type BrowserToolProvider = (typeof BROWSER_TOOL_PROVIDERS)[number];
export type ScreenToolProvider = (typeof SCREEN_TOOL_PROVIDERS)[number];

const serverSchema = z
    .object({
        host: z.string().default('127.0.0.1'),
        port: z.coerce.number().int().min(1).max(65535).default(8420),
        auth_token: z.string().optional(),
    })
    .passthrough()
    .default({});

const workspaceSchema = z
    .object({
        bootstrapMaxChars: z.coerce.number().int().positive().default(20_000),
        bootstrapTotalMaxChars: z.coerce.number().int().positive().default(100_000),
    })
    .passthrough()
    .default({});

const completionNotifySchema = z.union([
    z.literal(false),
    z.literal('background_only'),
]);
const agentToolModeSchema = z.enum(['native', 'hosted', 'disabled']);
const browserToolProviderSchema = z.enum(BROWSER_TOOL_PROVIDERS);
const screenToolProviderSchema = z.enum(SCREEN_TOOL_PROVIDERS);
const agentToolPolicySchema = z
    .object({
        shell: agentToolModeSchema.optional(),
        filesystem: agentToolModeSchema.optional(),
        browser: agentToolModeSchema.optional(),
        screen: agentToolModeSchema.optional(),
    })
    .default({});

const commonAgentPoolEntrySchema = z
    .object({
        enabled: z.boolean().default(true),
        timeout: z.coerce.number().int().positive().default(300),
        completion_notify: completionNotifySchema.default(false),
        tool_policy: agentToolPolicySchema,
    })
    .passthrough();

const cliAgentPoolEntrySchema = commonAgentPoolEntrySchema
    .extend({
        type: z.literal('cli'),
        command: z.string(),
        args: z.array(z.string()).default([]),
        output_format: z.enum(['text', 'json']).default('text'),
    })
    .passthrough();

const apiAgentPoolEntrySchema = commonAgentPoolEntrySchema
    .extend({
        type: z.literal('api'),
        provider: z.enum(['anthropic']).default('anthropic'),
        model: z.string(),
        api_key_env: z.string(),
        max_tokens: z.coerce.number().int().positive().default(8192),
        endpoint: z.string().default('https://api.anthropic.com/v1/messages'),
    })
    .passthrough();

const acpAgentPoolEntrySchema = commonAgentPoolEntrySchema
    .extend({
        type: z.literal('acp'),
        url: z.string(),
        agent_id: z.string(),
        auth: z
            .object({
                type: z.literal('bearer'),
                token_env: z.string(),
            })
            .passthrough()
            .optional(),
    })
    .passthrough();

const agentPoolEntrySchema = z.union([
    cliAgentPoolEntrySchema,
    apiAgentPoolEntrySchema,
    acpAgentPoolEntrySchema,
]);

const agentsSchema = z
    .object({
        default: z.string().default('claude-code'),
        routing: z.record(z.string()).default({}),
        safety: z
            .object({
                prompt_transport: z.enum(['stdin', 'argv']).default('stdin'),
                mutating_fallback: z.boolean().default(false),
            })
            .passthrough()
            .default({}),
        pool: z.record(agentPoolEntrySchema).default({}),
    })
    .passthrough()
    .default({});

const acpSchema = z
    .object({
        agents: z.record(z.unknown()).default({}),
        server: z
            .object({
                enabled: z.boolean().default(false),
                port: z.coerce.number().int().min(1).max(65535).default(8421),
            })
            .passthrough()
            .default({}),
    })
    .passthrough()
    .default({});

const telegramChannelSchema = z
    .object({
        enabled: z.boolean().default(false),
        token_env: z.string().default('TELEGRAM_BOT_TOKEN'),
        owner_id: z.coerce.number().int().default(0),
        allowed_users: z.array(z.coerce.number().int()).default([]),
        require_mention_in_groups: z.boolean().default(true),
        poll_timeout_seconds: z.coerce.number().int().min(1).max(50).default(20),
    })
    .passthrough()
    .default({});

const discordChannelSchema = z
    .object({
        enabled: z.boolean().default(false),
        token_env: z.string().default('DISCORD_BOT_TOKEN'),
    })
    .passthrough()
    .default({});

const feishuChannelSchema = z
    .object({
        enabled: z.boolean().default(false),
        app_id_env: z.string().default('FEISHU_APP_ID'),
        app_secret_env: z.string().default('FEISHU_APP_SECRET'),
    })
    .passthrough()
    .default({});

const webChannelSchema = z
    .object({
        enabled: z.boolean().default(true),
    })
    .passthrough()
    .default({});

const channelsSchema = z
    .object({
        telegram: telegramChannelSchema,
        discord: discordChannelSchema,
        feishu: feishuChannelSchema,
        web: webChannelSchema,
    })
    .passthrough()
    .default({});

const heartbeatSchema = z
    .object({
        enabled: z.boolean().default(true),
        interval: z.string().default('0 * * * *'),
        agent: z.string().default('direct-api'),
        notify: z.string().nullable().default('telegram'),
        silent_ok: z.boolean().default(true),
        inject_files: z
            .array(z.string())
            .default(['HEARTBEAT.md', 'PROJECT_HEARTBEAT.md']),
    })
    .passthrough()
    .default({});

const cronEntrySchema = z
    .object({
        schedule: z.string(),
        agent: z.string(),
        prompt: z.string(),
        notify: z.string().nullable().optional(),
    })
    .passthrough();

const toolsSchema = z
    .object({
        shell: z
            .object({
                confirm_destructive: z.boolean().default(true),
                blocked_commands: z.array(z.string()).default(['rm', 'rmdir']),
            })
            .passthrough()
            .default({}),
        filesystem: z
            .object({
                delete_mode: z.enum(['trash']).default('trash'),
                archive_dir: z.string().default('~/.willclaw/archive'),
            })
            .passthrough()
            .default({}),
        browser: z
            .object({
                headless: z.boolean().default(true),
                providers: z
                    .array(browserToolProviderSchema)
                    .min(1)
                    .default([...BROWSER_TOOL_PROVIDERS]),
            })
            .passthrough()
            .default({}),
        screen: z
            .object({
                enabled: z.boolean().default(true),
                providers: z
                    .array(screenToolProviderSchema)
                    .min(1)
                    .default([...SCREEN_TOOL_PROVIDERS]),
            })
            .passthrough()
            .default({}),
    })
    .passthrough()
    .default({});

const memorySchema = z
    .object({
        context_window_days: z.coerce.number().int().positive().default(3),
        max_history_messages: z.coerce.number().int().positive().default(20),
        search_reindex_on_start: z.boolean().default(true),
        exclude_revoked: z.boolean().default(true),
    })
    .passthrough()
    .default({});

const historySchema = z
    .object({
        enabled: z.boolean().default(true),
        dir: z.string().default('~/.willclaw/historyMessages'),
        include_system: z.boolean().default(true),
        git_auto_commit: z.boolean().default(false),
        index_exports: z.boolean().default(false),
    })
    .passthrough()
    .default({});

const loggingSchema = z
    .object({
        tool_log_db: z.string().default('~/.willclaw/logs/tool-executions.db'),
        app_log: z.string().default('~/.willclaw/logs/willclaw.log'),
        max_output_chars: z.coerce.number().int().positive().default(2_000),
        retain_days: z.coerce.number().int().positive().default(90),
    })
    .passthrough()
    .default({});

const daemonSchema = z
    .object({
        plist_label: z.string().default('com.willclaw.agent'),
        env_file: z.string().default('~/.willclaw/.env'),
    })
    .passthrough()
    .default({});

const rawConfigSchema = z
    .object({
        server: serverSchema,
        workspace: workspaceSchema,
        agents: agentsSchema,
        acp: acpSchema,
        channels: channelsSchema,
        heartbeat: heartbeatSchema,
        cron: z.record(cronEntrySchema).default({}),
        tools: toolsSchema,
        memory: memorySchema,
        history: historySchema,
        logging: loggingSchema,
        daemon: daemonSchema,
    })
    .passthrough();

type RawWillClawConfig = z.infer<typeof rawConfigSchema>;
export type AgentPoolEntry = z.infer<typeof agentPoolEntrySchema>;
export type CliAgentPoolEntry = z.infer<typeof cliAgentPoolEntrySchema>;
export type ApiAgentPoolEntry = z.infer<typeof apiAgentPoolEntrySchema>;
export type AcpAgentPoolEntry = z.infer<typeof acpAgentPoolEntrySchema>;
export type AgentToolPolicy = z.infer<typeof agentToolPolicySchema>;
export type TelegramChannelConfig = z.infer<typeof telegramChannelSchema>;

export function isCliAgentPoolEntry(
    entry: AgentPoolEntry,
): entry is CliAgentPoolEntry {
    return entry.type === 'cli';
}

export function isApiAgentPoolEntry(
    entry: AgentPoolEntry,
): entry is ApiAgentPoolEntry {
    return entry.type === 'api';
}

export function isAcpAgentPoolEntry(
    entry: AgentPoolEntry,
): entry is AcpAgentPoolEntry {
    return entry.type === 'acp';
}

export interface WillClawConfig extends RawWillClawConfig {
    homeDir: string;
    configPath: string;
    history: RawWillClawConfig['history'] & {
        dir: string;
    };
    logging: RawWillClawConfig['logging'] & {
        tool_log_db: string;
        app_log: string;
    };
    daemon: RawWillClawConfig['daemon'] & {
        env_file: string;
    };
    tools: RawWillClawConfig['tools'] & {
        shell: RawWillClawConfig['tools']['shell'] & {
            blocked_commands: string[];
        };
        filesystem: RawWillClawConfig['tools']['filesystem'] & {
            archive_dir: string;
        };
    };
}

function interpolateEnv(input: unknown): unknown {
    if (typeof input === 'string') {
        return input.replace(/\$\{([A-Z0-9_]+)\}/g, (_, variableName: string) => {
            return process.env[variableName] ?? `\${${variableName}}`;
        });
    }

    if (Array.isArray(input)) {
        return input.map((value) => interpolateEnv(value));
    }

    if (input && typeof input === 'object') {
        return Object.fromEntries(
            Object.entries(input).map(([key, value]) => [key, interpolateEnv(value)]),
        );
    }

    return input;
}

function normalizeConfigPaths(
    config: RawWillClawConfig,
    paths: WillClawPaths,
): WillClawConfig {
    return {
        ...config,
        homeDir: paths.homeDir,
        configPath: paths.configPath,
        history: {
            ...config.history,
            dir: resolveConfiguredPath(config.history.dir, paths),
        },
        logging: {
            ...config.logging,
            tool_log_db: resolveConfiguredPath(config.logging.tool_log_db, paths),
            app_log: resolveConfiguredPath(config.logging.app_log, paths),
        },
        daemon: {
            ...config.daemon,
            env_file: resolveConfiguredPath(config.daemon.env_file, paths),
        },
        tools: {
            ...config.tools,
            filesystem: {
                ...config.tools.filesystem,
                archive_dir: resolveConfiguredPath(
                    config.tools.filesystem.archive_dir,
                    paths,
                ),
            },
        },
    };
}

function resolveConfiguredPath(rawPath: string, paths: WillClawPaths): string {
    return expandHomeDir(rawPath)
        .replace(/^~\/\.willclaw/, paths.homeDir)
        .replace(/^~$/, paths.homeDir);
}

async function pathExists(targetPath: string): Promise<boolean> {
    try {
        await access(targetPath);
        return true;
    } catch {
        return false;
    }
}

export async function loadWillClawConfig(options?: {
    homeDir?: string;
}): Promise<{ config: WillClawConfig; paths: WillClawPaths }> {
    const paths = getWillClawPaths(options?.homeDir);
    const rawConfig = await readFile(paths.configPath, 'utf8');
    const parsedDraft = (parse(rawConfig) ?? {}) as Record<string, unknown>;
    const envFileDraft =
        parsedDraft.daemon &&
            typeof parsedDraft.daemon === 'object' &&
            'env_file' in parsedDraft.daemon &&
            typeof parsedDraft.daemon.env_file === 'string'
            ? parsedDraft.daemon.env_file
            : paths.envFilePath;

    const resolvedEnvFile = resolveConfiguredPath(envFileDraft, paths);
    if (await pathExists(resolvedEnvFile)) {
        loadDotEnv({
            path: resolvedEnvFile,
            override: false,
        });
    }

    const parsedConfig = rawConfigSchema.parse(interpolateEnv(parsedDraft));

    return {
        config: normalizeConfigPaths(parsedConfig, paths),
        paths,
    };
}
