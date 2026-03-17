import type { Logger } from 'pino';

import type { ChatService } from '../chat-service.js';
import type { TelegramChannelConfig } from '../config.js';

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

        if (text === '/status') {
            await this.sendTelegramMessage(token, message.chat.id, 'WillClaw is online.');
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
