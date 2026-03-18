import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { ScreenToolProvider, WillClawConfig } from '../config.js';
import type { ToolExecutionLogger } from '../tool-logger.js';

export interface ScreenToolContext {
    triggeredBy: string;
    chatId?: string;
    timeoutMs?: number;
}

export interface ScreenCaptureOptions {
    filePath: string;
    app?: string;
    mode?: 'screen' | 'window' | 'frontmost';
    windowTitle?: string;
    windowId?: number;
    screenIndex?: number;
    retina?: boolean;
}

export interface ScreenCaptureResult {
    filePath: string;
    provider: ScreenToolProvider;
    exitCode: number;
    output?: string;
    data?: unknown;
}

export interface ScreenSeeOptions {
    app?: string;
    mode?: 'screen' | 'window' | 'frontmost';
    path?: string;
    windowTitle?: string;
    windowId?: number;
    screenIndex?: number;
    annotate?: boolean;
    analyze?: string;
    timeoutSeconds?: number;
}

export interface ScreenSeeResult {
    provider: ScreenToolProvider;
    output: string;
    data?: unknown;
}

export interface ScreenClickOptions {
    query?: string;
    elementId?: string;
    coords?: string;
    app?: string;
    windowTitle?: string;
    windowId?: number;
    snapshotId?: string;
    double?: boolean;
    right?: boolean;
}

export interface ScreenClickResult {
    provider: ScreenToolProvider;
    output: string;
    data?: unknown;
}

export interface ScreenTypeOptions {
    text: string;
    app?: string;
    windowTitle?: string;
    windowId?: number;
    snapshotId?: string;
    clear?: boolean;
    pressReturn?: boolean;
}

export interface ScreenTypeResult {
    provider: ScreenToolProvider;
    output: string;
    data?: unknown;
}

export interface ScreenPressOptions {
    keys: string[];
    app?: string;
    windowTitle?: string;
    windowId?: number;
    snapshotId?: string;
    count?: number;
}

export interface ScreenPressResult {
    provider: ScreenToolProvider;
    output: string;
    data?: unknown;
}

interface ScreenCommand {
    provider: ScreenToolProvider;
    command: string;
    args: string[];
}

interface CommandExecutionResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}

type ScreenAction = 'capture' | 'see' | 'click' | 'type' | 'press';

function runCommand(
    command: ScreenCommand,
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
                    reject(new Error(stderr || stdout || error.message));
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

function appendPeekabooTargeting(
    args: string[],
    target: {
        app?: string;
        mode?: 'screen' | 'window' | 'frontmost';
        windowTitle?: string;
        windowId?: number;
        screenIndex?: number;
        snapshotId?: string;
    },
): string[] {
    const next = [...args];

    if (target.app) {
        next.push('--app', target.app);
    }
    if (target.mode) {
        next.push('--mode', target.mode);
    }
    if (target.windowTitle) {
        next.push('--window-title', target.windowTitle);
    }
    if (target.windowId != null) {
        next.push('--window-id', String(target.windowId));
    }
    if (target.screenIndex != null) {
        next.push('--screen-index', String(target.screenIndex));
    }
    if (target.snapshotId) {
        next.push('--snapshot', target.snapshotId);
    }

    return next;
}

export class ScreenTool {
    constructor(
        private readonly config: WillClawConfig,
        private readonly toolLogger: ToolExecutionLogger,
    ) { }

    private ensureEnabled(
        action: ScreenAction,
        context: ScreenToolContext,
        input: string,
    ): void {
        if (this.config.tools.screen.enabled) {
            return;
        }

        const error = 'Screen host tool is disabled by config';
        this.toolLogger.log({
            tool: 'screen',
            action,
            agent: context.triggeredBy,
            chatId: context.chatId,
            input,
            durationMs: 0,
            success: false,
            error,
        });
        throw new Error(error);
    }

    private async executeAction<T>(options: {
        action: ScreenAction;
        context: ScreenToolContext;
        input: string;
        run: (
            provider: ScreenToolProvider,
        ) => Promise<{
            result: T;
            output?: string;
            exitCode?: number;
        }>;
    }): Promise<T> {
        this.ensureEnabled(options.action, options.context, options.input);
        const failures: string[] = [];

        for (const provider of this.config.tools.screen.providers) {
            const startedAt = Date.now();

            try {
                const outcome = await options.run(provider);
                this.toolLogger.log({
                    tool: 'screen',
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
                    error instanceof Error ? error.message : 'Unknown screen tool error';
                failures.push(`${provider}: ${detail}`);
                this.toolLogger.log({
                    tool: 'screen',
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
            `Screen host tool failed across providers: ${failures.join('; ')}`,
        );
    }

    async capture(
        filePathOrOptions: string | ScreenCaptureOptions,
        context: ScreenToolContext,
    ): Promise<ScreenCaptureResult> {
        const options =
            typeof filePathOrOptions === 'string'
                ? { filePath: filePathOrOptions }
                : filePathOrOptions;
        const filePath = path.resolve(options.filePath);

        return await this.executeAction<ScreenCaptureResult>({
            action: 'capture',
            context,
            input: JSON.stringify({
                ...options,
                filePath,
            }),
            run: async (provider) => {
                if (provider === 'peekaboo') {
                    await mkdir(path.dirname(filePath), { recursive: true });
                    const args = appendPeekabooTargeting(
                        ['image', '--json', '--path', filePath],
                        options,
                    );
                    if (options.retina ?? true) {
                        args.push('--retina');
                    }

                    const executed = await runCommand(
                        {
                            provider,
                            command: 'peekaboo',
                            args,
                        },
                        context.timeoutMs,
                    );
                    const data = parseCommandData(executed.stdout);

                    return {
                        result: {
                            filePath,
                            provider,
                            exitCode: executed.exitCode,
                            output: summarizeCommandOutput(
                                executed.stdout,
                                `Saved screen capture to ${filePath}`,
                            ),
                            ...(data !== undefined ? { data } : {}),
                        },
                        output: summarizeCommandOutput(
                            executed.stdout,
                            `provider=${provider} filePath=${filePath}`,
                        ),
                        exitCode: executed.exitCode,
                    };
                }

                const simpleCapture =
                    !options.app &&
                    !options.windowTitle &&
                    options.windowId == null &&
                    options.screenIndex == null &&
                    (options.mode == null || options.mode === 'screen');
                if (!simpleCapture) {
                    throw new Error(
                        `${provider} only supports whole-screen fallback capture`,
                    );
                }
                if (process.platform !== 'darwin') {
                    throw new Error(
                        `${provider} is not implemented on platform: ${process.platform}`,
                    );
                }

                await mkdir(path.dirname(filePath), { recursive: true });
                const executed = await runCommand(
                    {
                        provider,
                        command: 'screencapture',
                        args: ['-x', filePath],
                    },
                    context.timeoutMs,
                );

                return {
                    result: {
                        filePath,
                        provider,
                        exitCode: executed.exitCode,
                        output: `Saved screen capture to ${filePath}`,
                    },
                    output: `provider=${provider} filePath=${filePath}`,
                    exitCode: executed.exitCode,
                };
            },
        });
    }

    async see(
        options: ScreenSeeOptions,
        context: ScreenToolContext,
    ): Promise<ScreenSeeResult> {
        return await this.executeAction<ScreenSeeResult>({
            action: 'see',
            context,
            input: JSON.stringify(options),
            run: async (provider) => {
                if (provider !== 'peekaboo') {
                    throw new Error(`${provider} does not support screen inspection`);
                }

                const args = appendPeekabooTargeting(['see', '--json'], options);
                if (options.path) {
                    await mkdir(path.dirname(path.resolve(options.path)), {
                        recursive: true,
                    });
                    args.push('--path', path.resolve(options.path));
                }
                if (options.annotate) {
                    args.push('--annotate');
                }
                if (options.analyze) {
                    args.push('--analyze', options.analyze);
                }
                if (options.timeoutSeconds) {
                    args.push('--timeout-seconds', String(options.timeoutSeconds));
                }

                const executed = await runCommand(
                    {
                        provider,
                        command: 'peekaboo',
                        args,
                    },
                    context.timeoutMs ?? (options.timeoutSeconds ? options.timeoutSeconds * 1000 : undefined),
                );
                const data = parseCommandData(executed.stdout);

                return {
                    result: {
                        provider,
                        output: summarizeCommandOutput(
                            executed.stdout,
                            'Screen inspection completed',
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
        options: ScreenClickOptions,
        context: ScreenToolContext,
    ): Promise<ScreenClickResult> {
        return await this.executeAction<ScreenClickResult>({
            action: 'click',
            context,
            input: JSON.stringify(options),
            run: async (provider) => {
                if (provider !== 'peekaboo') {
                    throw new Error(`${provider} does not support screen click actions`);
                }

                const args = appendPeekabooTargeting(['click', '--json'], options);
                if (options.query) {
                    args.push(options.query);
                }
                if (options.elementId) {
                    args.push('--id', options.elementId);
                }
                if (options.coords) {
                    args.push('--coords', options.coords);
                }
                if (options.double) {
                    args.push('--double');
                }
                if (options.right) {
                    args.push('--right');
                }

                const executed = await runCommand(
                    {
                        provider,
                        command: 'peekaboo',
                        args,
                    },
                    context.timeoutMs,
                );
                const data = parseCommandData(executed.stdout);

                return {
                    result: {
                        provider,
                        output: summarizeCommandOutput(
                            executed.stdout,
                            'Screen click completed',
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
        options: ScreenTypeOptions,
        context: ScreenToolContext,
    ): Promise<ScreenTypeResult> {
        return await this.executeAction<ScreenTypeResult>({
            action: 'type',
            context,
            input: JSON.stringify(options),
            run: async (provider) => {
                if (provider !== 'peekaboo') {
                    throw new Error(`${provider} does not support screen typing actions`);
                }

                const args = appendPeekabooTargeting(
                    ['type', options.text, '--json'],
                    options,
                );
                if (options.clear) {
                    args.push('--clear');
                }
                if (options.pressReturn) {
                    args.push('--return');
                }

                const executed = await runCommand(
                    {
                        provider,
                        command: 'peekaboo',
                        args,
                    },
                    context.timeoutMs,
                );
                const data = parseCommandData(executed.stdout);

                return {
                    result: {
                        provider,
                        output: summarizeCommandOutput(
                            executed.stdout,
                            'Screen typing completed',
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

    async press(
        options: ScreenPressOptions,
        context: ScreenToolContext,
    ): Promise<ScreenPressResult> {
        return await this.executeAction<ScreenPressResult>({
            action: 'press',
            context,
            input: JSON.stringify(options),
            run: async (provider) => {
                if (provider !== 'peekaboo') {
                    throw new Error(`${provider} does not support screen key actions`);
                }

                const args = appendPeekabooTargeting(
                    ['press', ...options.keys, '--json'],
                    options,
                );
                if (options.count) {
                    args.push('--count', String(options.count));
                }

                const executed = await runCommand(
                    {
                        provider,
                        command: 'peekaboo',
                        args,
                    },
                    context.timeoutMs,
                );
                const data = parseCommandData(executed.stdout);

                return {
                    result: {
                        provider,
                        output: summarizeCommandOutput(
                            executed.stdout,
                            'Screen key press completed',
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
}
