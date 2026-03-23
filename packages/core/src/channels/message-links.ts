import type { MemoryStore, StoredMessage } from '../memory.js';

export const CHANNEL_MESSAGE_ID_METADATA_KEY = 'channelMessageId';

export function createInboundMessageMetadata(
    channelMessageId: string,
): Record<string, unknown> {
    return {
        [CHANNEL_MESSAGE_ID_METADATA_KEY]: channelMessageId,
    };
}

export function findLinkedUserMessageByChannelMessageId(input: {
    memoryStore: MemoryStore;
    channel: string;
    chatId: string;
    userId: string;
    channelMessageId: string;
    limit?: number;
}): StoredMessage | null {
    const messages = input.memoryStore.listMessages({
        channel: input.channel,
        chatId: input.chatId,
        limit: input.limit ?? 200,
        includeRevoked: true,
    });

    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        const linkedMessageId = message?.metadata?.[CHANNEL_MESSAGE_ID_METADATA_KEY];
        if (
            message?.role === 'user' &&
            message.userId === input.userId &&
            typeof linkedMessageId === 'string' &&
            linkedMessageId === input.channelMessageId
        ) {
            return message.status === 'active' ? message : null;
        }
    }

    return null;
}
