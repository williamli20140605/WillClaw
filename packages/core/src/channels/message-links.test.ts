import assert from 'node:assert/strict';
import test from 'node:test';

import type { MemoryStore, StoredMessage } from '../memory.js';

import {
    CHANNEL_MESSAGE_ID_METADATA_KEY,
    findLinkedUserMessageByChannelMessageId,
} from './message-links.js';

function createMessage(
    input: Partial<StoredMessage> & {
        id: number;
        userId: string;
    },
): StoredMessage {
    return {
        id: input.id,
        timestamp: input.timestamp ?? '2026-03-23T00:00:00.000Z',
        channel: input.channel ?? 'telegram',
        chatId: input.chatId ?? 'room',
        userId: input.userId,
        role: input.role ?? 'user',
        content: input.content ?? `message-${input.id}`,
        status: input.status ?? 'active',
        ...(input.metadata ? { metadata: input.metadata } : {}),
        ...(input.runId ? { runId: input.runId } : {}),
    };
}

test('findLinkedUserMessageByChannelMessageId prefers the latest matching user message', () => {
    const messages = [
        createMessage({
            id: 1,
            userId: 'alice',
            metadata: {
                [CHANNEL_MESSAGE_ID_METADATA_KEY]: 'tg-1',
            },
        }),
        createMessage({
            id: 2,
            userId: 'bob',
            metadata: {
                [CHANNEL_MESSAGE_ID_METADATA_KEY]: 'tg-1',
            },
        }),
        createMessage({
            id: 3,
            userId: 'alice',
            status: 'revoked',
            metadata: {
                [CHANNEL_MESSAGE_ID_METADATA_KEY]: 'tg-1',
            },
        }),
        createMessage({
            id: 4,
            userId: 'alice',
            metadata: {
                [CHANNEL_MESSAGE_ID_METADATA_KEY]: 'tg-1',
            },
        }),
    ];
    const memoryStore = {
        listMessages() {
            return messages;
        },
    } as unknown as MemoryStore;

    const result = findLinkedUserMessageByChannelMessageId({
        memoryStore,
        channel: 'telegram',
        chatId: 'room',
        userId: 'alice',
        channelMessageId: 'tg-1',
    });

    assert.equal(result?.id, 4);
});
