import type { Logger } from 'pino';

import type { ChatService } from '../chat-service.js';
import type { WillClawConfig } from '../config.js';

import { TelegramChannel } from './telegram.js';
import type { ChannelAdapter } from './types.js';

export class ChannelManager {
    private readonly adapters: ChannelAdapter[] = [];

    constructor(
        private readonly config: WillClawConfig,
        private readonly chatService: ChatService,
        private readonly logger: Logger,
        private readonly workingDirectory: string,
    ) {
        if (this.config.channels.telegram.enabled) {
            this.adapters.push(
                new TelegramChannel(
                    this.config.channels.telegram,
                    this.chatService,
                    this.logger,
                    this.workingDirectory,
                ),
            );
        }
    }

    getConfiguredChannels(): string[] {
        return this.adapters.map((adapter) => adapter.name);
    }

    async start(): Promise<string[]> {
        const started: string[] = [];

        for (const adapter of this.adapters) {
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
        for (const adapter of [...this.adapters].reverse()) {
            await adapter.stop();
        }
    }
}
