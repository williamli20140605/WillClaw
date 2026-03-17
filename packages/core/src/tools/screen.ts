import { execFile } from 'node:child_process';

import type { ScreenToolProvider, WillClawConfig } from '../config.js';
import type { ToolExecutionLogger } from '../tool-logger.js';

export interface ScreenToolContext {
    triggeredBy: string;
    chatId?: string;
    timeoutMs?: number;
}

export interface ScreenCaptureResult {
    filePath: string;
    provider: ScreenToolProvider;
    exitCode: number;
}

interface ScreenCommand {
    provider: ScreenToolProvider;
    command: string;
    args: string[];
}

function resolveScreenCommand(
    filePath: string,
    provider: ScreenToolProvider,
): ScreenCommand {
    if (provider === 'peekaboo') {
        return {
            provider,
            command: 'peekaboo',
            args: ['image', '--mode', 'screen', '--path', filePath],
        };
    }

    if (process.platform === 'darwin') {
        return {
            provider,
            command: 'screencapture',
            args: ['-x', filePath],
        };
    }

    throw new Error(
        `screencapture provider is not implemented on platform: ${process.platform}`,
    );
}

function runCommand(command: ScreenCommand, timeoutMs?: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        execFile(
            command.command,
            command.args,
            {
                timeout: timeoutMs,
            },
            (error, _stdout, stderr) => {
                if (error) {
                    reject(new Error(stderr || error.message));
                    return;
                }

                resolve();
            },
        );
    });
}

export class ScreenTool {
    constructor(
        private readonly config: WillClawConfig,
        private readonly toolLogger: ToolExecutionLogger,
    ) { }

    async capture(
        filePath: string,
        context: ScreenToolContext,
    ): Promise<ScreenCaptureResult> {
        if (!this.config.tools.screen.enabled) {
            const error = 'Screen host tool is disabled by config';
            this.toolLogger.log({
                tool: 'screen',
                action: 'capture',
                agent: context.triggeredBy,
                chatId: context.chatId,
                input: filePath,
                durationMs: 0,
                success: false,
                error,
            });
            throw new Error(error);
        }

        const failures: string[] = [];

        for (const provider of this.config.tools.screen.providers) {
            const startedAt = Date.now();

            try {
                const command = resolveScreenCommand(filePath, provider);
                await runCommand(command, context.timeoutMs);
                this.toolLogger.log({
                    tool: 'screen',
                    action: 'capture',
                    agent: context.triggeredBy,
                    chatId: context.chatId,
                    input: filePath,
                    output: `provider=${provider}`,
                    durationMs: Date.now() - startedAt,
                    success: true,
                });

                return {
                    filePath,
                    provider,
                    exitCode: 0,
                };
            } catch (error) {
                const detail =
                    error instanceof Error ? error.message : 'Unknown screen tool error';
                failures.push(`${provider}: ${detail}`);
                this.toolLogger.log({
                    tool: 'screen',
                    action: 'capture',
                    agent: context.triggeredBy,
                    chatId: context.chatId,
                    input: filePath,
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
}
