import { exec } from 'node:child_process';

import type { WillClawConfig } from '../config.js';
import type { ToolExecutionLogger } from '../tool-logger.js';

export interface ShellToolContext {
    triggeredBy: string;
    chatId?: string;
    cwd?: string;
    timeoutMs?: number;
}

export interface ShellExecResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}

function getFirstCommandToken(command: string): string {
    return command.trim().split(/\s+/)[0] ?? '';
}

export class ShellTool {
    constructor(
        private readonly config: WillClawConfig,
        private readonly toolLogger: ToolExecutionLogger,
    ) { }

    async exec(
        command: string,
        context: ShellToolContext,
    ): Promise<ShellExecResult> {
        const startedAt = Date.now();
        const firstToken = getFirstCommandToken(command);

        if (this.config.tools.shell.blocked_commands.includes(firstToken)) {
            const error = `Blocked command: ${firstToken}`;
            this.toolLogger.log({
                tool: 'shell',
                action: 'exec',
                agent: context.triggeredBy,
                chatId: context.chatId,
                input: command,
                durationMs: Date.now() - startedAt,
                success: false,
                error,
            });
            throw new Error(error);
        }

        return await new Promise<ShellExecResult>((resolve, reject) => {
            exec(
                command,
                {
                    cwd: context.cwd,
                    timeout: context.timeoutMs,
                    maxBuffer: 10 * 1024 * 1024,
                },
                (error, stdout, stderr) => {
                    const durationMs = Date.now() - startedAt;
                    const exitCode =
                        error && typeof error.code === 'number' ? error.code : 0;

                    if (error) {
                        this.toolLogger.log({
                            tool: 'shell',
                            action: 'exec',
                            agent: context.triggeredBy,
                            chatId: context.chatId,
                            input: command,
                            output: stdout,
                            exitCode,
                            durationMs,
                            success: false,
                            error: stderr || error.message,
                        });
                        reject(error);
                        return;
                    }

                    this.toolLogger.log({
                        tool: 'shell',
                        action: 'exec',
                        agent: context.triggeredBy,
                        chatId: context.chatId,
                        input: command,
                        output: stdout,
                        exitCode: 0,
                        durationMs,
                        success: true,
                    });
                    resolve({
                        stdout,
                        stderr,
                        exitCode: 0,
                    });
                },
            );
        });
    }
}
