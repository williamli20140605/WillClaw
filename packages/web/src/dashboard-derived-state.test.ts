import assert from 'node:assert/strict';
import test from 'node:test';

import { createDashboardDerivedState } from './dashboard-derived-state.js';

test('createDashboardDerivedState keeps activity scoped to the selected web conversation', () => {
    const state = createDashboardDerivedState({
        activeRuns: [],
        chats: [
            {
                channel: 'web',
                chatId: 'chat-1',
                updatedAt: '2026-03-22T00:00:00.000Z',
                messageCount: 1,
                preview: 'Investigate reconnect state',
                role: 'user',
            },
        ],
        cronState: null,
        deferredComposerText: '',
        draftChatId: null,
        messages: [],
        queueSummaries: [],
        recentEvents: [
            {
                id: 'global',
                type: 'scheduler.task.completed',
                timestamp: '2026-03-22T00:00:00.000Z',
                payload: {},
            },
            {
                id: 'web-selected',
                type: 'message.created',
                timestamp: '2026-03-22T00:01:00.000Z',
                payload: {
                    channel: 'web',
                    chatId: 'chat-1',
                },
            },
            {
                id: 'web-channel-wide',
                type: 'background.task.started',
                timestamp: '2026-03-22T00:02:00.000Z',
                payload: {
                    channel: 'web',
                },
            },
            {
                id: 'web-other-chat',
                type: 'message.created',
                timestamp: '2026-03-22T00:03:00.000Z',
                payload: {
                    channel: 'web',
                    chatId: 'chat-2',
                },
            },
            {
                id: 'telegram-chat',
                type: 'message.created',
                timestamp: '2026-03-22T00:04:00.000Z',
                payload: {
                    channel: 'telegram',
                    chatId: 'tg-1',
                },
            },
        ],
        selectedChatId: 'chat-1',
        status: null,
    });

    assert.deepEqual(
        state.currentRecentEvents.map((event) => event.id),
        ['global', 'web-selected', 'web-channel-wide'],
    );
});

test('createDashboardDerivedState keeps draft threads separate from tracked counts', () => {
    const state = createDashboardDerivedState({
        activeRuns: [],
        chats: [
            {
                channel: 'web',
                chatId: 'chat-1',
                updatedAt: '2026-03-22T00:00:00.000Z',
                messageCount: 1,
                preview: 'Persisted thread',
                role: 'user',
            },
        ],
        cronState: null,
        deferredComposerText: '',
        draftChatId: 'chat-draft',
        messages: [],
        queueSummaries: [],
        recentEvents: [],
        selectedChatId: 'chat-draft',
        status: null,
    });

    assert.equal(state.chatList[0]?.isDraft, true);
    assert.equal(state.trackedThreadCount, 1);
});
