import type { Logger } from 'pino';

import type { ChatService } from '../chat-service.js';
import type { TelegramChannelConfig } from '../config.js';
import type { MemoryStore, StoredMessage } from '../memory.js';
import type { Orchestrator } from '../orchestrator.js';
import type { WillClawScheduler } from '../scheduler.js';

import type { ChannelAdapter } from './types.js';

interface TelegramUser {
    id: number;
    is_bot: boolean;
    username?: string;
    first_name?: string;
}

interface TelegramChat {
    id: number;
    type: 'private' | 'group' | 'supergroup' | 'channel';
    title?: string;
}

interface TelegramMessage {
    message_id: number;
    text?: string;
    chat: TelegramChat;
    from?: TelegramUser;
    reply_to_message?: {
        from?: TelegramUser;
    };
}

interface TelegramUpdate {
    update_id: number;
    message?: TelegramMessage;
    edited_message?: TelegramMessage;
}

interface TelegramResponse<T> {
    ok: boolean;
    result: T;
    description?: string;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function splitTelegramText(content: string): string[] {
    const normalized = content.trim();
    if (!normalized) {
        return ['(empty response)'];
    }

    if (normalized.length <= 4_000) {
        return [normalized];
    }

    const chunks: string[] = [];
    let remaining = normalized;

    while (remaining.length > 0) {
        if (remaining.length <= 4_000) {
            chunks.push(remaining);
            break;
        }

        const slice = remaining.slice(0, 4_000);
        const breakAt = slice.lastIndexOf('\n');
        const boundary = breakAt > 2_000 ? breakAt : 4_000;
        chunks.push(remaining.slice(0, boundary));
        remaining = remaining.slice(boundary).trimStart();
    }

    return chunks;
}

function normalizeCommandName(text: string): string | null {
    if (!text.startsWith('/')) {
        return null;
    }

    const [head] = text.split(/\s+/, 1);
    if (!head) {
        return null;
    }

    return head.toLowerCase();
}

function readCommandArgs(text: string): string {
    const firstSpace = text.indexOf(' ');
    if (firstSpace < 0) {
        return '';
    }

    return text.slice(firstSpace + 1).trim();
}

function summarizeMessage(message: StoredMessage): string {
    const normalized = message.content.replace(/\s+/g, ' ').trim();
    if (normalized.length <= 96) {
        return normalized;
    }

    return `${normalized.slice(0, 95).trim()}...`;
}

export class TelegramChannel implements ChannelAdapter {
    readonly name = 'telegram';

    private botUsername = '';
    private offset = 0;
    private stopped = true;
    private loopPromise: Promise<void> | undefined;
    private activePoll: AbortController | undefined;

    constructor(
        private readonly config: TelegramChannelConfig,
        private readonly chatService: ChatService,
        private readonly orchestrator: Orchestrator,
        private readonly scheduler: WillClawScheduler,
        private readonly memoryStore: MemoryStore,
        private readonly logger: Logger,
        private readonly workingDirectory: string,
    ) { }

    async start(): Promise<boolean> {
        if (this.loopPromise) {
            return true;
        }

        const token = this.getToken();
        if (!token) {
            this.logger.warn(
                {
                    channel: this.name,
                    tokenEnv: this.config.token_env,
                },
                'Telegram channel enabled but token env is missing; skipping channel startup',
            );
            return false;
        }

        const me = await this.apiRequest<{ id: number; username?: string }>(
            token,
            'getMe',
            {},
        );
        this.botUsername = me.username ?? '';
        this.stopped = false;
        this.loopPromise = this.pollLoop(token);
        this.logger.info(
            {
                channel: this.name,
                username: this.botUsername || undefined,
            },
            'Telegram channel started',
        );
        return true;
    }

    async stop(): Promise<void> {
        this.stopped = true;
        this.activePoll?.abort();

        if (this.loopPromise) {
            await this.loopPromise;
            this.loopPromise = undefined;
        }
    }

    private getToken(): string | undefined {
        return process.env[this.config.token_env];
    }

    private async pollLoop(token: string): Promise<void> {
        while (!this.stopped) {
            try {
                const updates = await this.apiRequest<TelegramUpdate[]>(
                    token,
                    'getUpdates',
                    {
                        offset: this.offset,
                        timeout: this.config.poll_timeout_seconds,
                        allowed_updates: ['message', 'edited_message'],
                    },
                    true,
                );

                for (const update of updates) {
                    this.offset = update.update_id + 1;
                    const message = update.message ?? update.edited_message;
                    if (!message) {
                        continue;
                    }

                    await this.handleMessage(token, message);
                }
            } catch (error) {
                if (this.stopped) {
                    break;
                }

                this.logger.error(
                    {
                        channel: this.name,
                        error: error instanceof Error ? error.message : String(error),
                    },
                    'Telegram polling failed',
                );
                await sleep(3_000);
            }
        }
    }

    private async handleMessage(
        token: string,
        message: TelegramMessage,
    ): Promise<void> {
        const sender = message.from;
        const rawText = message.text?.trim();
        if (!sender || sender.is_bot || !rawText) {
            return;
        }

        if (!this.isAllowedUser(sender.id)) {
            this.logger.warn(
                {
                    channel: this.name,
                    userId: sender.id,
                    chatId: message.chat.id,
                },
                'Ignoring Telegram message from unauthorized user',
            );
            return;
        }

        if (!this.shouldHandleMessage(rawText, message)) {
            return;
        }

        const text = this.normalizeIncomingText(rawText);
        if (!text) {
            return;
        }

        try {
            const commandResponse = await this.tryHandleCommand(token, message);
            if (commandResponse) {
                return;
            }
        } catch (error) {
            this.logger.error(
                {
                    channel: this.name,
                    chatId: message.chat.id,
                    userId: sender.id,
                    error: error instanceof Error ? error.message : String(error),
                },
                'Telegram command handling failed',
            );
            await this.sendMessage(
                String(message.chat.id),
                `WillClaw command error: ${error instanceof Error ? error.message : 'Unknown failure'}`,
            );
            return;
        }

        await this.sendChatAction(token, message.chat.id, 'typing');

        try {
            const result = await this.chatService.handleChat({
                text,
                channel: this.name,
                chatId: String(message.chat.id),
                userId: String(sender.id),
                isGroup: message.chat.type !== 'private',
                workingDirectory: this.workingDirectory,
            });

            for (const chunk of splitTelegramText(result.content)) {
                await this.sendTelegramMessage(token, message.chat.id, chunk);
            }
        } catch (error) {
            this.logger.error(
                {
                    channel: this.name,
                    chatId: message.chat.id,
                    userId: sender.id,
                    error: error instanceof Error ? error.message : String(error),
                },
                'Telegram chat handling failed',
            );
            await this.sendMessage(
                String(message.chat.id),
                `WillClaw error: ${error instanceof Error ? error.message : 'Unknown failure'
                }`,
            );
        }
    }

    private async tryHandleCommand(
        token: string,
        message: TelegramMessage,
    ): Promise<boolean> {
        const rawText = this.normalizeIncomingText(message.text?.trim() ?? '');
        if (!rawText.startsWith('/')) {
            return false;
        }

        const command = normalizeCommandName(rawText);
        const args = readCommandArgs(rawText);
        const chatId = String(message.chat.id);
        const isGroup = message.chat.type !== 'private';
        const userId = String(message.from?.id ?? '0');

        switch (command) {
            case '/status': {
                const availability = await this.orchestrator.listAgents();
                const available = availability.filter((agent) => agent.available);
                const latestRun = await this.findLatestTrackedRun(chatId);
                const lines = [
                    'WillClaw is online.',
                    `Available agents: ${available.length}/${availability.length}`,
                    available.length > 0
                        ? `Agents: ${available.map((agent) => agent.name).join(', ')}`
                        : 'Agents: none available',
                    latestRun
                        ? `Latest run: ${latestRun.run.runId.slice(0, 8)} · ${latestRun.run.status} · ${latestRun.run.agent}`
                        : 'Latest run: none',
                ];
                await this.sendTelegramMessage(token, message.chat.id, lines.join('\n'));
                return true;
            }
            case '/undo': {
                const latestUserMessage = this.findLatestUserMessage(chatId);
                if (!latestUserMessage) {
                    await this.sendTelegramMessage(
                        token,
                        message.chat.id,
                        'Nothing to undo in this chat yet.',
                    );
                    return true;
                }

                await this.chatService.revokeMessage(latestUserMessage.id);
                await this.sendTelegramMessage(
                    token,
                    message.chat.id,
                    `Revoked message #${latestUserMessage.id}: ${summarizeMessage(latestUserMessage)}`,
                );
                return true;
            }
            case '/resend': {
                const latestUserMessage = this.findLatestUserMessage(chatId);
                if (!latestUserMessage) {
                    await this.sendTelegramMessage(
                        token,
                        message.chat.id,
                        'No user message found to resend.',
                    );
                    return true;
                }

                await this.sendChatAction(token, message.chat.id, 'typing');
                const result = await this.chatService.resendMessage(latestUserMessage.id, {
                    channel: this.name,
                    chatId,
                    userId,
                    isGroup,
                    workingDirectory: this.workingDirectory,
                });
                if (!result) {
                    await this.sendTelegramMessage(
                        token,
                        message.chat.id,
                        'Resend failed because the original message could not be found.',
                    );
                    return true;
                }

                for (const chunk of splitTelegramText(result.content)) {
                    await this.sendTelegramMessage(token, message.chat.id, chunk);
                }
                return true;
            }
            case '/cancel': {
                const latestRun = await this.findLatestTrackedRun(chatId);
                if (!latestRun || !latestRun.active) {
                    await this.sendTelegramMessage(
                        token,
                        message.chat.id,
                        'No active run found in this chat.',
                    );
                    return true;
                }

                await this.chatService.cancelRun(latestRun.run.runId);
                await this.sendTelegramMessage(
                    token,
                    message.chat.id,
                    `Cancelled run ${latestRun.run.runId.slice(0, 8)}.`,
                );
                return true;
            }
            case '/heartbeat': {
                await this.sendChatAction(token, message.chat.id, 'typing');
                const result = await this.scheduler.runHeartbeatNow();
                await this.sendTelegramMessage(
                    token,
                    message.chat.id,
                    this.renderTaskResult('heartbeat', result),
                );
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
                    await this.sendTelegramMessage(token, message.chat.id, lines.join('\n'));
                    return true;
                }

                await this.sendChatAction(token, message.chat.id, 'typing');
                const result = await this.scheduler.runCronNow(args);
                await this.sendTelegramMessage(
                    token,
                    message.chat.id,
                    this.renderTaskResult(`cron:${args}`, result),
                );
                return true;
            }
            default:
                return false;
        }
    }

    async sendMessage(chatId: string, text: string): Promise<void> {
        const token = this.getToken();
        if (!token) {
            throw new Error(
                `Telegram token env ${this.config.token_env} is not available.`,
            );
        }

        for (const chunk of splitTelegramText(text)) {
            await this.sendTelegramMessage(token, chatId, chunk);
        }
    }

    private isAllowedUser(userId: number): boolean {
        if (this.config.owner_id > 0) {
            return (
                userId === this.config.owner_id ||
                this.config.allowed_users.includes(userId)
            );
        }

        if (this.config.allowed_users.length > 0) {
            return this.config.allowed_users.includes(userId);
        }

        return true;
    }

    private shouldHandleMessage(text: string, message: TelegramMessage): boolean {
        if (message.chat.type === 'private') {
            return true;
        }

        if (!this.config.require_mention_in_groups) {
            return true;
        }

        if (this.botUsername) {
            const mention = `@${this.botUsername}`.toLowerCase();
            if (text.toLowerCase().includes(mention)) {
                return true;
            }
        }

        const repliedUser = message.reply_to_message?.from;
        return Boolean(repliedUser?.is_bot);
    }

    private normalizeIncomingText(text: string): string {
        let normalized = text.trim();

        if (this.botUsername) {
            const mentionPattern = new RegExp(`@${this.botUsername}\\b`, 'ig');
            normalized = normalized.replace(mentionPattern, '').trim();
            normalized = normalized.replace(
                new RegExp(`^/([a-z_]+)@${this.botUsername}\\b`, 'i'),
                '/$1',
            );
        }

        return normalized.trim();
    }

    private async sendChatAction(
        token: string,
        chatId: number,
        action: 'typing',
    ): Promise<void> {
        try {
            await this.apiRequest(token, 'sendChatAction', {
                chat_id: chatId,
                action,
            });
        } catch (error) {
            this.logger.debug(
                {
                    channel: this.name,
                    chatId,
                    error: error instanceof Error ? error.message : String(error),
                },
                'Telegram sendChatAction failed',
            );
        }
    }

    private findLatestUserMessage(chatId: string): StoredMessage | null {
        const messages = this.memoryStore.listMessages({
            channel: this.name,
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

    private async findLatestTrackedRun(chatId: string): Promise<{
        run: NonNullable<ReturnType<ChatService['getRunStatus']>['run']>;
        active: boolean;
    } | null> {
        const messages = this.memoryStore.listMessages({
            channel: this.name,
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

    private async sendTelegramMessage(
        token: string,
        chatId: number | string,
        text: string,
    ): Promise<void> {
        await this.apiRequest(token, 'sendMessage', {
            chat_id: chatId,
            text,
        });
    }

    private async apiRequest<T>(
        token: string,
        method: string,
        payload: Record<string, unknown>,
        longPolling = false,
    ): Promise<T> {
        const controller = new AbortController();
        const timeoutMs = longPolling
            ? (this.config.poll_timeout_seconds + 5) * 1_000
            : 30_000;
        const timer = setTimeout(() => {
            controller.abort();
        }, timeoutMs);

        if (longPolling) {
            this.activePoll = controller;
        }

        try {
            const response = await fetch(
                `https://api.telegram.org/bot${token}/${method}`,
                {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                    },
                    body: JSON.stringify(payload),
                    signal: controller.signal,
                },
            );
            const body = (await response.json()) as TelegramResponse<T>;

            if (!response.ok || !body.ok) {
                throw new Error(
                    body.description || `Telegram API returned ${response.status}`,
                );
            }

            return body.result;
        } finally {
            clearTimeout(timer);
            if (longPolling && this.activePoll === controller) {
                this.activePoll = undefined;
            }
        }
    }
}
