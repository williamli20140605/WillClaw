import type { Logger } from 'pino';
import {
    ChannelType,
    Client,
    GatewayIntentBits,
    Partials,
    type Message,
} from 'discord.js';

import type { ChatService } from '../chat-service.js';
import type { DiscordChannelConfig } from '../config.js';
import type { MemoryStore } from '../memory.js';
import type { Orchestrator } from '../orchestrator.js';
import type { WillClawScheduler } from '../scheduler.js';

import { ChannelShellCommands } from './shell-commands.js';
import type { ChannelAdapter } from './types.js';

function splitDiscordText(content: string): string[] {
    const normalized = content.trim();
    if (!normalized) {
        return ['(empty response)'];
    }

    if (normalized.length <= 1_900) {
        return [normalized];
    }

    const chunks: string[] = [];
    let remaining = normalized;

    while (remaining.length > 0) {
        if (remaining.length <= 1_900) {
            chunks.push(remaining);
            break;
        }

        const slice = remaining.slice(0, 1_900);
        const breakAt = slice.lastIndexOf('\n');
        const boundary = breakAt > 900 ? breakAt : 1_900;
        chunks.push(remaining.slice(0, boundary));
        remaining = remaining.slice(boundary).trimStart();
    }

    return chunks;
}

function isSendableChannel(
    channel: unknown,
): channel is {
    send: (content: string) => Promise<unknown>;
    sendTyping: () => Promise<unknown>;
} {
    return Boolean(
        channel &&
        typeof channel === 'object' &&
        'send' in channel &&
        typeof channel.send === 'function' &&
        'sendTyping' in channel &&
        typeof channel.sendTyping === 'function',
    );
}

export class DiscordChannel implements ChannelAdapter {
    readonly name = 'discord';

    private client: Client | null = null;
    private readonly shellCommands: ChannelShellCommands;

    constructor(
        private readonly config: DiscordChannelConfig,
        private readonly chatService: ChatService,
        private readonly orchestrator: Orchestrator,
        private readonly scheduler: WillClawScheduler,
        private readonly memoryStore: MemoryStore,
        private readonly logger: Logger,
        private readonly workingDirectory: string,
    ) {
        this.shellCommands = new ChannelShellCommands(
            this.chatService,
            this.orchestrator,
            this.scheduler,
            this.memoryStore,
        );
    }

    async start(): Promise<boolean> {
        if (this.client) {
            return true;
        }

        const token = this.getToken();
        if (!token) {
            this.logger.warn(
                {
                    channel: this.name,
                    tokenEnv: this.config.token_env,
                },
                'Discord channel enabled but token env is missing; skipping channel startup',
            );
            return false;
        }

        const client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.DirectMessages,
                GatewayIntentBits.MessageContent,
            ],
            partials: [Partials.Channel],
        });

        client.once('ready', () => {
            this.logger.info(
                {
                    channel: this.name,
                    username: client.user?.tag,
                },
                'Discord channel started',
            );
        });
        client.on('messageCreate', (message) => {
            void this.handleMessage(message);
        });

        await client.login(token);
        this.client = client;
        return true;
    }

    async stop(): Promise<void> {
        if (!this.client) {
            return;
        }

        this.client.destroy();
        this.client = null;
    }

    async sendMessage(chatId: string, text: string): Promise<void> {
        const client = this.client;
        if (!client) {
            throw new Error('Discord client is not started.');
        }

        const channel = await client.channels.fetch(chatId);
        if (!isSendableChannel(channel)) {
            throw new Error(`Discord channel ${chatId} is not text-based.`);
        }

        for (const chunk of splitDiscordText(text)) {
            await channel.send(chunk);
        }
    }

    private getToken(): string | undefined {
        return process.env[this.config.token_env];
    }

    private async handleMessage(message: Message): Promise<void> {
        if (message.author.bot) {
            return;
        }

        const rawText = message.content?.trim();
        if (!rawText) {
            return;
        }

        if (!this.isAllowedUser(message.author.id)) {
            this.logger.warn(
                {
                    channel: this.name,
                    userId: message.author.id,
                    chatId: message.channelId,
                },
                'Ignoring Discord message from unauthorized user',
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
            const commandHandled = await this.shellCommands.handle({
                text,
                channel: this.name,
                chatId: message.channelId,
                userId: message.author.id,
                isGroup: message.channel.type !== ChannelType.DM,
                workingDirectory: this.workingDirectory,
                reply: async (content) => {
                    await this.sendMessage(message.channelId, content);
                },
                showTyping: async () => {
                    if (isSendableChannel(message.channel)) {
                        await message.channel.sendTyping();
                    }
                },
            });
            if (commandHandled) {
                return;
            }
        } catch (error) {
            this.logger.error(
                {
                    channel: this.name,
                    chatId: message.channelId,
                    userId: message.author.id,
                    error: error instanceof Error ? error.message : String(error),
                },
                'Discord command handling failed',
            );
            await this.sendMessage(
                message.channelId,
                `WillClaw command error: ${error instanceof Error ? error.message : 'Unknown failure'}`,
            );
            return;
        }

        try {
            if (isSendableChannel(message.channel)) {
                await message.channel.sendTyping();
            }

            const result = await this.chatService.handleChat({
                text,
                channel: this.name,
                chatId: message.channelId,
                userId: message.author.id,
                isGroup: message.channel.type !== ChannelType.DM,
                workingDirectory: this.workingDirectory,
            });

            await this.sendMessage(message.channelId, result.content);
        } catch (error) {
            this.logger.error(
                {
                    channel: this.name,
                    chatId: message.channelId,
                    userId: message.author.id,
                    error: error instanceof Error ? error.message : String(error),
                },
                'Discord chat handling failed',
            );
            await this.sendMessage(
                message.channelId,
                `WillClaw error: ${error instanceof Error ? error.message : 'Unknown failure'}`,
            );
        }
    }

    private isAllowedUser(userId: string): boolean {
        if (this.config.owner_id) {
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

    private shouldHandleMessage(text: string, message: Message): boolean {
        if (message.channel.type === ChannelType.DM) {
            return true;
        }

        if (!this.config.require_mention_in_guilds) {
            return true;
        }

        const clientUserId = this.client?.user?.id;
        if (!clientUserId) {
            return false;
        }

        if (message.mentions.users.has(clientUserId)) {
            return true;
        }

        return text.includes(`<@${clientUserId}>`) || text.includes(`<@!${clientUserId}>`);
    }

    private normalizeIncomingText(text: string): string {
        const clientUserId = this.client?.user?.id;
        if (!clientUserId) {
            return text.trim();
        }

        return text
            .replace(new RegExp(`<@!?${clientUserId}>`, 'g'), '')
            .trim();
    }
}
