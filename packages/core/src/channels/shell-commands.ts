import type { ChatService } from '../chat-service.js';
import type { MemoryStore, StoredMessage } from '../memory.js';
import type { Orchestrator } from '../orchestrator.js';
import type { PairingManager } from '../pairing.js';
import type { WillClawScheduler } from '../scheduler.js';

function normalizeCommandName(text: string): string | null {
    if (!text.startsWith('/')) {
        return null;
    }

    const [head] = text.split(/\s+/, 1);
    return head ? head.toLowerCase() : null;
}

function readCommandArgs(text: string): string {
    const firstSpace = text.indexOf(' ');
    return firstSpace < 0 ? '' : text.slice(firstSpace + 1).trim();
}

function summarizeMessage(message: StoredMessage): string {
    const normalized = message.content.replace(/\s+/g, ' ').trim();
    return normalized.length <= 96
        ? normalized
        : `${normalized.slice(0, 95).trim()}...`;
}

export interface ShellCommandContext {
    text: string;
    channel: string;
    chatId: string;
    userId: string;
    isGroup: boolean;
    workingDirectory: string;
    reply: (text: string) => Promise<void>;
    showTyping?: () => Promise<void>;
}

export class ChannelShellCommands {
    constructor(
        private readonly chatService: ChatService,
        private readonly orchestrator: Orchestrator,
        private readonly scheduler: WillClawScheduler,
        private readonly memoryStore: MemoryStore,
        private readonly pairingManager: PairingManager,
    ) { }

    async handle(input: ShellCommandContext): Promise<boolean> {
        if (!input.text.startsWith('/')) {
            return false;
        }

        const command = normalizeCommandName(input.text);
        const args = readCommandArgs(input.text);

        switch (command) {
            case '/status': {
                const availability = await this.orchestrator.listAgents();
                const available = availability.filter((agent) => agent.available);
                const latestRun = this.findLatestTrackedRun(
                    input.channel,
                    input.chatId,
                );
                const queue = this.findQueue(input.channel, input.chatId);
                const lines = [
                    'WillClaw is online.',
                    `Available agents: ${available.length}/${availability.length}`,
                    available.length > 0
                        ? `Agents: ${available.map((agent) => agent.name).join(', ')}`
                        : 'Agents: none available',
                    latestRun
                        ? `Latest run: ${latestRun.run.runId.slice(0, 8)} · ${latestRun.run.status} · ${latestRun.run.agent}`
                        : 'Latest run: none',
                    queue
                        ? `Queue: ${queue.total} pending (${queue.running} running, ${queue.queued} queued)`
                        : 'Queue: idle',
                ];
                await input.reply(lines.join('\n'));
                return true;
            }
            case '/pair': {
                if (!args) {
                    await input.reply('Usage: /pair <pairing-code>');
                    return true;
                }

                const granted = await this.pairingManager.pairChannelUser({
                    channel: input.channel,
                    userId: input.userId,
                    code: args,
                });
                if (!granted) {
                    await input.reply('Invalid or expired pairing code.');
                    return true;
                }

                await input.reply(
                    `Pairing complete. ${input.channel} access is now enabled for this account.`,
                );
                return true;
            }
            case '/queue': {
                const queue = this.findQueue(input.channel, input.chatId);
                if (!queue) {
                    await input.reply('Queue is idle for this chat.');
                    return true;
                }

                const lines = [
                    `Queue for ${input.channel}:${input.chatId}`,
                    `Running: ${queue.running} · Queued: ${queue.queued} · Total: ${queue.total}`,
                    ...queue.runs.map((run) => {
                        const message = this.memoryStore.getMessageById(
                            run.userMessageId,
                        );
                        const label = message
                            ? summarizeMessage(message)
                            : `message #${run.userMessageId}`;
                        return `${run.position}. ${run.status} · ${run.runId.slice(0, 8)} · ${label}`;
                    }),
                ];
                await input.reply(lines.join('\n'));
                return true;
            }
            case '/undo': {
                const latestUserMessage = this.findLatestUserMessage(
                    input.channel,
                    input.chatId,
                );
                if (!latestUserMessage) {
                    await input.reply('Nothing to undo in this chat yet.');
                    return true;
                }

                await this.chatService.revokeMessage(latestUserMessage.id);
                await input.reply(
                    `Revoked message #${latestUserMessage.id}: ${summarizeMessage(latestUserMessage)}`,
                );
                return true;
            }
            case '/edit': {
                if (!args) {
                    await input.reply('Usage: /edit <new message text>');
                    return true;
                }

                const latestUserMessage = this.findLatestUserMessage(
                    input.channel,
                    input.chatId,
                );
                if (!latestUserMessage) {
                    await input.reply('No user message found to edit.');
                    return true;
                }

                if (input.showTyping) {
                    await input.showTyping();
                }

                const result = await this.chatService.editMessage(
                    latestUserMessage.id,
                    {
                        text: args,
                        isGroup: input.isGroup,
                        workingDirectory: input.workingDirectory,
                    },
                );
                if (!result) {
                    await input.reply(
                        'Edit failed because the original message could not be found.',
                    );
                    return true;
                }

                await input.reply(
                    `Edited message #${latestUserMessage.id}.\n\n${result.result.content}`,
                );
                return true;
            }
            case '/resend': {
                const latestUserMessage = this.findLatestUserMessage(
                    input.channel,
                    input.chatId,
                );
                if (!latestUserMessage) {
                    await input.reply('No user message found to resend.');
                    return true;
                }

                if (input.showTyping) {
                    await input.showTyping();
                }

                const result = await this.chatService.resendMessage(
                    latestUserMessage.id,
                    {
                        channel: input.channel,
                        chatId: input.chatId,
                        userId: input.userId,
                        isGroup: input.isGroup,
                        workingDirectory: input.workingDirectory,
                    },
                );
                if (!result) {
                    await input.reply(
                        'Resend failed because the original message could not be found.',
                    );
                    return true;
                }

                await input.reply(result.content);
                return true;
            }
            case '/cancel': {
                const latestRun = this.findLatestTrackedRun(
                    input.channel,
                    input.chatId,
                );
                if (!latestRun || !latestRun.active) {
                    await input.reply('No active run found in this chat.');
                    return true;
                }

                await this.chatService.cancelRun(latestRun.run.runId);
                await input.reply(
                    `Cancelled run ${latestRun.run.runId.slice(0, 8)}.`,
                );
                return true;
            }
            case '/heartbeat': {
                if (input.showTyping) {
                    await input.showTyping();
                }

                const result = await this.scheduler.runHeartbeatNow();
                await input.reply(this.renderTaskResult('heartbeat', result));
                return true;
            }
            case '/cron': {
                if (!args) {
                    const tasks = this.scheduler
                        .listTasks()
                        .filter((task) => task.kind === 'cron');
                    const lines = [
                        'Cron tasks:',
                        ...tasks.map(
                            (task) =>
                                `- ${task.name} · ${task.schedule}${task.lastResult ? ` · ${task.lastResult}` : ''}`,
                        ),
                        'Run one with /cron <task-name>',
                    ];
                    await input.reply(lines.join('\n'));
                    return true;
                }

                if (input.showTyping) {
                    await input.showTyping();
                }

                const result = await this.scheduler.runCronNow(args);
                await input.reply(this.renderTaskResult(`cron:${args}`, result));
                return true;
            }
            default:
                return false;
        }
    }

    private findLatestUserMessage(
        channel: string,
        chatId: string,
    ): StoredMessage | null {
        const messages = this.memoryStore.listMessages({
            channel,
            chatId,
            limit: 40,
            includeRevoked: false,
        });

        for (let index = messages.length - 1; index >= 0; index -= 1) {
            const message = messages[index];
            if (message?.role === 'user') {
                return message;
            }
        }

        return null;
    }

    private findLatestTrackedRun(
        channel: string,
        chatId: string,
    ): {
        run: NonNullable<ReturnType<ChatService['getRunStatus']>['run']>;
        active: boolean;
    } | null {
        const messages = this.memoryStore.listMessages({
            channel,
            chatId,
            limit: 40,
            includeRevoked: true,
        });

        for (let index = messages.length - 1; index >= 0; index -= 1) {
            const runId = messages[index]?.runId;
            if (!runId) {
                continue;
            }

            const status = this.chatService.getRunStatus(runId);
            if (status.run) {
                return {
                    run: status.run,
                    active: status.active,
                };
            }
        }

        return null;
    }

    private findQueue(
        channel: string,
        chatId: string,
    ): ReturnType<ChatService['listQueues']>[number] | null {
        return this.chatService.listQueues({ channel, chatId })[0] ?? null;
    }

    private renderTaskResult(taskName: string, result: unknown): string {
        if (
            result &&
            typeof result === 'object' &&
            'content' in result &&
            typeof result.content === 'string'
        ) {
            const lines = [`${taskName} completed.`];
            if ('agent' in result && typeof result.agent === 'string') {
                lines.push(`Agent: ${result.agent}`);
            }
            if ('suppressed' in result && result.suppressed === true) {
                lines.push('Result: suppressed');
            }
            lines.push('');
            lines.push(result.content);
            return lines.join('\n');
        }

        if (
            result &&
            typeof result === 'object' &&
            'filepath' in result &&
            typeof result.filepath === 'string'
        ) {
            return `${taskName} completed.\n${result.filepath}`;
        }

        return `${taskName} completed.`;
    }
}
