import assert from 'node:assert/strict';
import test from 'node:test';

import type { Logger } from 'pino';

import {
    ChatService,
    type ChatServiceRequest,
} from './chat-service.js';
import { WillClawEventHub } from './events.js';
import type { MemoryStore, StoredMessage } from './memory.js';
import type { MemorySearchService } from './memory-search.js';
import type { Orchestrator } from './orchestrator.js';

const originalUserMessage: StoredMessage = {
    id: 10,
    timestamp: '2026-03-22T08:00:00.000Z',
    channel: 'web',
    chatId: 'chat-1',
    userId: 'web-ui',
    role: 'user',
    content: 'Original prompt',
    status: 'active',
    runId: 'run-original',
};

const originalAssistantMessage: StoredMessage = {
    id: 11,
    timestamp: '2026-03-22T08:00:01.000Z',
    channel: 'web',
    chatId: 'chat-1',
    userId: 'codex',
    role: 'assistant',
    content: 'Original answer',
    agent: 'codex',
    status: 'active',
    runId: 'run-original',
};

const laterUserMessage: StoredMessage = {
    id: 12,
    timestamp: '2026-03-22T08:05:00.000Z',
    channel: 'web',
    chatId: 'chat-1',
    userId: 'web-ui',
    role: 'user',
    content: 'Follow-up prompt',
    status: 'active',
    runId: 'run-follow-up',
};

function createMemoryStoreStub(): MemoryStore {
    let nextMessageId = 1000;

    return {
        getMessageById(id: number) {
            return id === originalUserMessage.id ? originalUserMessage : null;
        },
        listMessages() {
            return [
                originalUserMessage,
                originalAssistantMessage,
                laterUserMessage,
            ];
        },
        saveMessage(input: Parameters<MemoryStore['saveMessage']>[0]) {
            nextMessageId += 1;
            return {
                id: nextMessageId,
                timestamp: input.timestamp ?? '2026-03-22T08:10:00.000Z',
                channel: input.channel,
                chatId: input.chatId,
                userId: input.userId,
                role: input.role,
                content: input.content,
                status: input.status ?? 'active',
                ...(input.agent ? { agent: input.agent } : {}),
                ...(input.durationMs != null
                    ? { durationMs: input.durationMs }
                    : {}),
                ...(input.exitCode != null ? { exitCode: input.exitCode } : {}),
                ...(input.metadata ? { metadata: input.metadata } : {}),
                ...(input.revokedAt ? { revokedAt: input.revokedAt } : {}),
                ...(input.editOf != null ? { editOf: input.editOf } : {}),
                ...(input.runId ? { runId: input.runId } : {}),
            };
        },
    } as unknown as MemoryStore;
}

class TestChatService extends ChatService {
    callOrder: string[] = [];
    capturedRequest: ChatServiceRequest | null = null;
    revokeArgs:
        | {
            messageId: number;
            options: { annotate?: boolean } | undefined;
        }
        | null = null;
    failReplacement = false;

    override async handleChat(
        request: ChatServiceRequest,
    ): Promise<Awaited<ReturnType<ChatService['handleChat']>>> {
        this.callOrder.push('handleChat');
        this.capturedRequest = request;

        if (this.failReplacement) {
            throw new Error('Replacement failed.');
        }

        return {
            runId: 'run-edited',
            agent: 'codex',
            content: 'Updated answer',
            duration: 12,
            attemptedAgents: ['codex'],
            systemPromptChars: 0,
            promptSections: [],
            channel: request.channel ?? 'web',
            chatId: request.chatId ?? 'default',
            userMessageId: 21,
            assistantMessageId: 22,
        };
    }

    override async revokeMessage(
        messageId: number,
        options?: { annotate?: boolean },
    ) {
        this.callOrder.push('revokeMessage');
        this.revokeArgs = {
            messageId,
            options,
        };

        return {
            targetMessageId: messageId,
            revokedMessageIds: [10, 11],
            runId: 'run-original',
        };
    }
}

function createChatService(): TestChatService {
    return new TestChatService(
        {
            memory: {
                max_history_messages: 16,
            },
        } as never,
        {} as Orchestrator,
        createMemoryStoreStub(),
        {} as MemorySearchService,
        null,
        {} as never,
        ({
            error() {},
            warn() {},
        } as unknown) as Logger,
        new WillClawEventHub(),
    );
}

test('editMessage defers revocation until the replacement run succeeds', async () => {
    const chatService = createChatService();

    const result = await chatService.editMessage(10, {
        text: 'Updated prompt',
    });

    assert.deepEqual(chatService.callOrder, ['handleChat', 'revokeMessage']);
    assert.deepEqual(chatService.revokeArgs, {
        messageId: 10,
        options: {
            annotate: false,
        },
    });
    assert.deepEqual(chatService.capturedRequest?.history, [
        {
            role: 'user',
            content: 'Follow-up prompt',
        },
    ]);
    assert.equal(result?.result.userMessageId, 21);
    assert.deepEqual(result?.revokedMessageIds, [10, 11]);
});

test('editMessage keeps the original messages when the replacement run fails', async () => {
    const chatService = createChatService();
    chatService.failReplacement = true;

    await assert.rejects(
        chatService.editMessage(10, {
            text: 'Updated prompt',
        }),
        {
            message: 'Replacement failed.',
        },
    );

    assert.deepEqual(chatService.callOrder, ['handleChat']);
    assert.equal(chatService.revokeArgs, null);
});
