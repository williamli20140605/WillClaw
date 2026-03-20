import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { BrowserToolProvider, WillClawConfig } from '../config.js';
import type { ToolExecutionLogger } from '../tool-logger.js';

export interface BrowserToolContext {
    triggeredBy: string;
    chatId?: string;
    browserApp?: string;
    timeoutMs?: number;
    sessionName?: string;
}

export interface BrowserOpenResult {
    target: string;
    launcher: string;
    provider: BrowserToolProvider;
    exitCode: number;
    sessionName?: string;
}

export interface BrowserSnapshotOptions {
    interactive?: boolean;
    compact?: boolean;
    depth?: number;
    selector?: string;
}

export interface BrowserSnapshotResult {
    provider: BrowserToolProvider;
    sessionName?: string;
    output: string;
    data?: unknown;
}

export interface BrowserClickOptions {
    selector: string;
    newTab?: boolean;
}

export interface BrowserClickResult {
    provider: BrowserToolProvider;
    sessionName?: string;
    selector: string;
    output: string;
    data?: unknown;
}

export interface BrowserTypeOptions {
    text: string;
    selector?: string;
    clear?: boolean;
}

export interface BrowserTypeResult {
    provider: BrowserToolProvider;
    sessionName?: string;
    selector?: string;
    output: string;
    data?: unknown;
}

export interface BrowserScreenshotOptions {
    filePath: string;
    fullPage?: boolean;
    annotate?: boolean;
}

export interface BrowserScreenshotResult {
    provider: BrowserToolProvider;
    sessionName?: string;
    filePath: string;
    output: string;
    data?: unknown;
}

export interface BrowserInspectPageOptions {
    target: string;
    interactive?: boolean;
    compact?: boolean;
    depth?: number;
    selector?: string;
    screenshot?: boolean;
    screenshotPath?: string;
    fullPage?: boolean;
}

export interface BrowserInspectPageResult {
    target: string;
    open: BrowserOpenResult;
    snapshot: BrowserSnapshotResult;
    screenshot?: BrowserScreenshotResult;
}

interface BrowserCommand {
    provider: BrowserToolProvider;
    command: string;
    args: string[];
    launcher: string;
}

interface CommandExecutionResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}

type BrowserAction =
    | 'open_url'
    | 'snapshot'
    | 'click'
    | 'type'
    | 'screenshot'
    | 'inspect_page';

function normalizeBrowserTarget(target: string): string {
    const url = new URL(target);
    if (!['http:', 'https:', 'file:'].includes(url.protocol)) {
        throw new Error(`Unsupported browser target protocol: ${url.protocol}`);
    }

    return url.toString();
}

function sanitizeSessionName(value: string): string {
    const sanitized = value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
    return sanitized || 'default';
}

function resolveSessionName(context: BrowserToolContext): string | undefined {
    if (context.sessionName) {
        return sanitizeSessionName(context.sessionName);
    }

    if (context.chatId) {
        return sanitizeSessionName(`willclaw-${context.chatId}`);
    }

    return undefined;
}

function appendAgentBrowserGlobals(
    args: string[],
    config: WillClawConfig,
    context: BrowserToolContext,
    options?: {
        json?: boolean;
    },
): string[] {
    const next = [...args];
    const sessionName = resolveSessionName(context);

    if (sessionName) {
        next.push('--session', sessionName);
    }

    if (!config.tools.browser.headless) {
        next.push('--headed');
    }

    if (options?.json) {
        next.push('--json');
    }

    return next;
}

function resolveSystemOpenCommand(
    target: string,
    browserApp?: string,
): BrowserCommand {
    if (process.platform === 'darwin') {
        return {
            provider: 'system-open',
            command: 'open',
            args: browserApp ? ['-a', browserApp, target] : [target],
            launcher: browserApp ? `open -a ${browserApp}` : 'open',
        };
    }

    if (process.platform === 'linux') {
        if (browserApp) {
            return {
                provider: 'system-open',
                command: browserApp,
                args: [target],
                launcher: browserApp,
            };
        }

        return {
            provider: 'system-open',
            command: 'xdg-open',
            args: [target],
            launcher: 'xdg-open',
        };
    }

    throw new Error(
        `system-open browser provider is not implemented on platform: ${process.platform}`,
    );
}

function runCommand(
    command: BrowserCommand,
    timeoutMs?: number,
): Promise<CommandExecutionResult> {
    return new Promise<CommandExecutionResult>((resolve, reject) => {
        execFile(
            command.command,
            command.args,
            {
                timeout: timeoutMs,
                maxBuffer: 10 * 1024 * 1024,
            },
            (error, stdout, stderr) => {
                if (error) {
                    const detail = stderr || stdout || error.message;
                    reject(new Error(detail));
                    return;
                }

                resolve({
                    stdout,
                    stderr,
                    exitCode: 0,
                });
            },
        );
    });
}

function parseCommandData(stdout: string): unknown {
    const trimmed = stdout.trim();
    if (!trimmed) {
        return undefined;
    }

    try {
        return JSON.parse(trimmed);
    } catch {
        return undefined;
    }
}

function summarizeCommandOutput(stdout: string, fallback: string): string {
    const trimmed = stdout.trim();
    return trimmed || fallback;
}

export class BrowserTool {
    constructor(
        private readonly config: WillClawConfig,
        private readonly toolLogger: ToolExecutionLogger,
    ) { }

    private async executeAction<T>(options: {
        action: BrowserAction;
        context: BrowserToolContext;
        input: string;
        run: (
            provider: BrowserToolProvider,
        ) => Promise<{
            result: T;
            output?: string;
            exitCode?: number;
        }>;
    }): Promise<T> {
        const failures: string[] = [];

        for (const provider of this.config.tools.browser.providers) {
            const startedAt = Date.now();

            try {
                const outcome = await options.run(provider);
                this.toolLogger.log({
                    tool: 'browser',
                    action: options.action,
                    agent: options.context.triggeredBy,
                    chatId: options.context.chatId,
                    input: options.input,
                    output: outcome.output ?? `provider=${provider}`,
                    exitCode: outcome.exitCode ?? 0,
                    durationMs: Date.now() - startedAt,
                    success: true,
                });

                return outcome.result;
            } catch (error) {
                const detail =
                    error instanceof Error ? error.message : 'Unknown browser tool error';
                failures.push(`${provider}: ${detail}`);
                this.toolLogger.log({
                    tool: 'browser',
                    action: options.action,
                    agent: options.context.triggeredBy,
                    chatId: options.context.chatId,
                    input: options.input,
                    output: `provider=${provider}`,
                    durationMs: Date.now() - startedAt,
                    success: false,
                    error: detail,
                });
            }
        }

        throw new Error(
            `Browser host tool failed across providers: ${failures.join('; ')}`,
        );
    }

    async openUrl(
        target: string,
        context: BrowserToolContext,
    ): Promise<BrowserOpenResult> {
        const normalizedTarget = normalizeBrowserTarget(target);
        const sessionName = resolveSessionName(context);

        return await this.executeAction<BrowserOpenResult>({
            action: 'open_url',
            context,
            input: normalizedTarget,
            run: async (provider) => {
                if (provider === 'agent-browser') {
                    const command: BrowserCommand = {
                        provider,
                        command: 'agent-browser',
                        args: appendAgentBrowserGlobals(
                            ['open', normalizedTarget],
                            this.config,
                            context,
                        ),
                        launcher: 'agent-browser',
                    };
                    await runCommand(command, context.timeoutMs);

                    return {
                        result: {
                            target: normalizedTarget,
                            launcher: command.launcher,
                            provider,
                            exitCode: 0,
                            ...(sessionName ? { sessionName } : {}),
                        },
                        output: `provider=${provider} launcher=${command.launcher}`,
                        exitCode: 0,
                    };
                }

                const command = resolveSystemOpenCommand(
                    normalizedTarget,
                    context.browserApp,
                );
                await runCommand(command, context.timeoutMs);

                return {
                    result: {
                        target: normalizedTarget,
                        launcher: command.launcher,
                        provider,
                        exitCode: 0,
                    },
                    output: `provider=${provider} launcher=${command.launcher}`,
                    exitCode: 0,
                };
            },
        });
    }

    async snapshot(
        options: BrowserSnapshotOptions,
        context: BrowserToolContext,
    ): Promise<BrowserSnapshotResult> {
        const sessionName = resolveSessionName(context);

        return await this.executeAction<BrowserSnapshotResult>({
            action: 'snapshot',
            context,
            input: JSON.stringify(options),
            run: async (provider) => {
                if (provider !== 'agent-browser') {
                    throw new Error(
                        `${provider} does not support structured browser snapshots`,
                    );
                }

                const args = ['snapshot'];
                if (options.interactive) {
                    args.push('-i');
                }
                if (options.compact) {
                    args.push('-c');
                }
                if (options.depth) {
                    args.push('--depth', String(options.depth));
                }
                if (options.selector) {
                    args.push('--selector', options.selector);
                }

                const command: BrowserCommand = {
                    provider,
                    command: 'agent-browser',
                    args: appendAgentBrowserGlobals(args, this.config, context, {
                        json: true,
                    }),
                    launcher: 'agent-browser',
                };
                const executed = await runCommand(command, context.timeoutMs);
                const data = parseCommandData(executed.stdout);

                return {
                    result: {
                        provider,
                        ...(sessionName ? { sessionName } : {}),
                        output: summarizeCommandOutput(
                            executed.stdout,
                            'Snapshot completed',
                        ),
                        ...(data !== undefined ? { data } : {}),
                    },
                    output: summarizeCommandOutput(
                        executed.stdout,
                        `provider=${provider}`,
                    ),
                    exitCode: executed.exitCode,
                };
            },
        });
    }

    async click(
        options: BrowserClickOptions,
        context: BrowserToolContext,
    ): Promise<BrowserClickResult> {
        const sessionName = resolveSessionName(context);

        return await this.executeAction<BrowserClickResult>({
            action: 'click',
            context,
            input: JSON.stringify(options),
            run: async (provider) => {
                if (provider !== 'agent-browser') {
                    throw new Error(`${provider} does not support browser click actions`);
                }

                const args = ['click', options.selector];
                if (options.newTab) {
                    args.push('--new-tab');
                }

                const command: BrowserCommand = {
                    provider,
                    command: 'agent-browser',
                    args: appendAgentBrowserGlobals(args, this.config, context, {
                        json: true,
                    }),
                    launcher: 'agent-browser',
                };
                const executed = await runCommand(command, context.timeoutMs);
                const data = parseCommandData(executed.stdout);

                return {
                    result: {
                        provider,
                        ...(sessionName ? { sessionName } : {}),
                        selector: options.selector,
                        output: summarizeCommandOutput(
                            executed.stdout,
                            'Click completed',
                        ),
                        ...(data !== undefined ? { data } : {}),
                    },
                    output: summarizeCommandOutput(
                        executed.stdout,
                        `provider=${provider}`,
                    ),
                    exitCode: executed.exitCode,
                };
            },
        });
    }

    async type(
        options: BrowserTypeOptions,
        context: BrowserToolContext,
    ): Promise<BrowserTypeResult> {
        const sessionName = resolveSessionName(context);

        return await this.executeAction<BrowserTypeResult>({
            action: 'type',
            context,
            input: JSON.stringify({
                selector: options.selector ?? null,
                clear: options.clear ?? false,
                text: options.text,
            }),
            run: async (provider) => {
                if (provider !== 'agent-browser') {
                    throw new Error(`${provider} does not support browser typing actions`);
                }

                const args = options.selector
                    ? [
                        options.clear ? 'fill' : 'type',
                        options.selector,
                        options.text,
                    ]
                    : ['keyboard', 'type', options.text];
                const command: BrowserCommand = {
                    provider,
                    command: 'agent-browser',
                    args: appendAgentBrowserGlobals(args, this.config, context, {
                        json: true,
                    }),
                    launcher: 'agent-browser',
                };
                const executed = await runCommand(command, context.timeoutMs);
                const data = parseCommandData(executed.stdout);

                return {
                    result: {
                        provider,
                        ...(sessionName ? { sessionName } : {}),
                        ...(options.selector ? { selector: options.selector } : {}),
                        output: summarizeCommandOutput(
                            executed.stdout,
                            'Type completed',
                        ),
                        ...(data !== undefined ? { data } : {}),
                    },
                    output: summarizeCommandOutput(
                        executed.stdout,
                        `provider=${provider}`,
                    ),
                    exitCode: executed.exitCode,
                };
            },
        });
    }

    async screenshot(
        options: BrowserScreenshotOptions,
        context: BrowserToolContext,
    ): Promise<BrowserScreenshotResult> {
        const sessionName = resolveSessionName(context);
        const filePath = path.resolve(options.filePath);

        return await this.executeAction<BrowserScreenshotResult>({
            action: 'screenshot',
            context,
            input: JSON.stringify({
                filePath,
                fullPage: options.fullPage ?? false,
                annotate: options.annotate ?? false,
            }),
            run: async (provider) => {
                if (provider !== 'agent-browser') {
                    throw new Error(
                        `${provider} does not support browser screenshot actions`,
                    );
                }

                await mkdir(path.dirname(filePath), { recursive: true });
                const args = ['screenshot', filePath];
                if (options.fullPage) {
                    args.push('--full');
                }
                if (options.annotate) {
                    args.push('--annotate');
                }

                const command: BrowserCommand = {
                    provider,
                    command: 'agent-browser',
                    args: appendAgentBrowserGlobals(args, this.config, context, {
                        json: true,
                    }),
                    launcher: 'agent-browser',
                };
                const executed = await runCommand(command, context.timeoutMs);
                const data = parseCommandData(executed.stdout);

                return {
                    result: {
                        provider,
                        ...(sessionName ? { sessionName } : {}),
                        filePath,
                        output: summarizeCommandOutput(
                            executed.stdout,
                            `Saved browser screenshot to ${filePath}`,
                        ),
                        ...(data !== undefined ? { data } : {}),
                    },
                    output: summarizeCommandOutput(
                        executed.stdout,
                        `provider=${provider} filePath=${filePath}`,
                    ),
                    exitCode: executed.exitCode,
                };
            },
        });
    }

    async inspectPage(
        options: BrowserInspectPageOptions,
        context: BrowserToolContext,
    ): Promise<BrowserInspectPageResult> {
        const open = await this.openUrl(options.target, context);
        const snapshot = await this.snapshot(
            {
                ...(options.interactive !== undefined
                    ? { interactive: options.interactive }
                    : { interactive: true }),
                ...(options.compact !== undefined
                    ? { compact: options.compact }
                    : { compact: true }),
                ...(options.depth !== undefined ? { depth: options.depth } : {}),
                ...(options.selector ? { selector: options.selector } : {}),
            },
            context,
        );

        const screenshot =
            options.screenshot || options.screenshotPath
                ? await this.screenshot(
                    {
                        filePath:
                            options.screenshotPath ??
                            path.join(
                                '/tmp',
                                `willclaw-browser-inspect-${Date.now().toString(36)}.png`,
                            ),
                        ...(options.fullPage !== undefined
                            ? { fullPage: options.fullPage }
                            : { fullPage: true }),
                    },
                    context,
                )
                : undefined;

        return {
            target: open.target,
            open,
            snapshot,
            ...(screenshot ? { screenshot } : {}),
        };
    }
}
