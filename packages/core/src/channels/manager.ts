import type { Logger } from 'pino';

import type { ChatService } from '../chat-service.js';
import type { WillClawConfig } from '../config.js';
import type { MemoryStore } from '../memory.js';
import type { Orchestrator } from '../orchestrator.js';
import type { WillClawScheduler } from '../scheduler.js';

import { DiscordChannel } from './discord.js';
import { TelegramChannel } from './telegram.js';
import type { ChannelAdapter, ChannelNotifier } from './types.js';

export class ChannelManager implements ChannelNotifier {
    private readonly adapters = new Map<string, ChannelAdapter>();

    constructor(
        private readonly config: WillClawConfig,
        private readonly chatService: ChatService,
        private readonly orchestrator: Orchestrator,
        private readonly scheduler: WillClawScheduler,
        private readonly memoryStore: MemoryStore,
        private readonly logger: Logger,
        private readonly workingDirectory: string,
    ) {
        if (this.config.channels.telegram.enabled) {
            const adapter = new TelegramChannel(
                this.config.channels.telegram,
                this.chatService,
                this.orchestrator,
                this.scheduler,
                this.memoryStore,
                this.logger,
                this.workingDirectory,
            );
            this.adapters.set(adapter.name, adapter);
        }

        if (this.config.channels.discord.enabled) {
            const adapter = new DiscordChannel(
                this.config.channels.discord,
                this.chatService,
                this.orchestrator,
                this.scheduler,
                this.memoryStore,
                this.logger,
                this.workingDirectory,
            );
            this.adapters.set(adapter.name, adapter);
        }
    }

    getConfiguredChannels(): string[] {
        return [...this.adapters.values()].map((adapter) => adapter.name);
    }

    async start(): Promise<string[]> {
        const started: string[] = [];

        for (const adapter of this.adapters.values()) {
            try {
                if (await adapter.start()) {
                    started.push(adapter.name);
                }
            } catch (error) {
                this.logger.error(
                    {
                        channel: adapter.name,
                        error: error instanceof Error ? error.message : String(error),
                    },
                    'Channel startup failed',
                );
            }
        }

        return started;
    }

    async stop(): Promise<void> {
        for (const adapter of [...this.adapters.values()].reverse()) {
            await adapter.stop();
        }
    }

    async sendMessage(
        channel: string,
        chatId: string,
        text: string,
    ): Promise<boolean> {
        const adapter = this.adapters.get(channel);
        if (!adapter) {
            return false;
        }

        await adapter.sendMessage(chatId, text);
        return true;
    }
}
