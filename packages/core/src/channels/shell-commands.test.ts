import assert from 'node:assert/strict';
import test from 'node:test';

import type { ChatService } from '../chat-service.js';
import type { MemoryStore, StoredMessage, StoredCommandRun } from '../memory.js';
import type { Orchestrator } from '../orchestrator.js';
import type { PairingManager } from '../pairing.js';
import type { WillClawScheduler } from '../scheduler.js';

import { ChannelShellCommands } from './shell-commands.js';

function createStoredMessage(
    input: Partial<StoredMessage> & {
        id: number;
        userId: string;
        content: string;
    },
): StoredMessage {
    return {
        id: input.id,
        timestamp: input.timestamp ?? '2026-03-23T00:00:00.000Z',
        channel: input.channel ?? 'telegram',
        chatId: input.chatId ?? 'room',
        userId: input.userId,
        role: input.role ?? 'user',
        content: input.content,
        status: input.status ?? 'active',
        ...(input.runId ? { runId: input.runId } : {}),
    };
}

function createRun(runId: string, status: StoredCommandRun['status']): StoredCommandRun {
    return {
        id: Number(runId.replace(/\D/g, '') || '1'),
        runId,
        timestamp: '2026-03-23T00:00:00.000Z',
        agent: 'codex',
        chatId: 'room',
        prompt: 'test',
        status,
    };
}

function createShellCommandsHarness(messages: StoredMessage[]) {
    const revokeCalls: number[] = [];
    const editCalls: Array<{ id: number; text: string }> = [];
    const cancelCalls: string[] = [];
    const replies: string[] = [];

    const memoryStore = {
        listMessages(options?: {
            includeRevoked?: boolean;
        }) {
            return messages.filter(
                (message) =>
                    options?.includeRevoked === true || message.status !== 'revoked',
            );
        },
        getMessageById(id: number) {
            return messages.find((message) => message.id === id) ?? null;
        },
    } as unknown as MemoryStore;

    const runs = new Map<string, StoredCommandRun>();
    for (const message of messages) {
        if (message.runId) {
            const runStatus =
                message.runId === 'run-alice-active' ? 'running' : 'completed';
            runs.set(message.runId, createRun(message.runId, runStatus));
        }
    }

    const chatService = {
        async revokeMessage(id: number) {
            revokeCalls.push(id);
            return {
                targetMessageId: id,
                revokedMessageIds: [id],
            };
        },
        async editMessage(
            id: number,
            request: {
                text: string;
            },
        ) {
            editCalls.push({
                id,
                text: request.text,
            });
            return {
                revokedMessageIds: [id],
                result: {
                    runId: 'replacement-run',
                    agent: 'codex',
                    content: 'edited reply',
                    duration: 1,
                    attemptedAgents: ['codex'],
                    systemPromptChars: 1,
                    promptSections: [],
                    channel: 'telegram',
                    chatId: 'room',
                    userMessageId: 99,
                    assistantMessageId: 100,
                },
            };
        },
        async resendMessage() {
            throw new Error('not needed in this test');
        },
        async cancelRun(runId: string) {
            cancelCalls.push(runId);
            return {
                run: runs.get(runId) ?? null,
                active: false,
                cancelled: true,
            };
        },
        getRunStatus(runId: string) {
            const run = runs.get(runId) ?? null;
            return {
                run,
                active: run?.status === 'running' || run?.status === 'queued',
            };
        },
        listQueues() {
            return [];
        },
    } as unknown as ChatService;

    const commands = new ChannelShellCommands(
        chatService,
        {} as Orchestrator,
        {
            listTasks() {
                return [];
            },
        } as unknown as WillClawScheduler,
        memoryStore,
        {
            isEnabled() {
                return true;
            },
            async pairChannelUser() {
                return null;
            },
        } as unknown as PairingManager,
    );

    return {
        commands,
        revokeCalls,
        editCalls,
        cancelCalls,
        replies,
    };
}

test('/undo targets the latest user message from the issuing user', async () => {
    const harness = createShellCommandsHarness([
        createStoredMessage({
            id: 1,
            userId: 'alice',
            content: 'alice earlier',
        }),
        createStoredMessage({
            id: 2,
            userId: 'bob',
            content: 'bob latest',
        }),
    ]);

    await harness.commands.handle({
        text: '/undo',
        channel: 'telegram',
        chatId: 'room',
        userId: 'alice',
        isGroup: true,
        workingDirectory: '/tmp',
        async reply(text: string) {
            harness.replies.push(text);
        },
    });

    assert.deepEqual(harness.revokeCalls, [1]);
});

test('/edit targets the latest user message from the issuing user', async () => {
    const harness = createShellCommandsHarness([
        createStoredMessage({
            id: 1,
            userId: 'alice',
            content: 'alice earlier',
        }),
        createStoredMessage({
            id: 2,
            userId: 'bob',
            content: 'bob latest',
        }),
    ]);

    await harness.commands.handle({
        text: '/edit updated',
        channel: 'telegram',
        chatId: 'room',
        userId: 'alice',
        isGroup: true,
        workingDirectory: '/tmp',
        async reply(text: string) {
            harness.replies.push(text);
        },
    });

    assert.deepEqual(harness.editCalls, [
        {
            id: 1,
            text: 'updated',
        },
    ]);
});

test('/cancel targets the latest tracked run from the issuing user', async () => {
    const harness = createShellCommandsHarness([
        createStoredMessage({
            id: 1,
            userId: 'alice',
            content: 'alice active',
            runId: 'run-alice-active',
        }),
        createStoredMessage({
            id: 2,
            userId: 'bob',
            content: 'bob latest',
            runId: 'run-bob-completed',
        }),
    ]);

    await harness.commands.handle({
        text: '/cancel',
        channel: 'telegram',
        chatId: 'room',
        userId: 'alice',
        isGroup: true,
        workingDirectory: '/tmp',
        async reply(text: string) {
            harness.replies.push(text);
        },
    });

    assert.deepEqual(harness.cancelCalls, ['run-alice-active']);
});
