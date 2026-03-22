import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildChatRequestPayload,
    buildEditRequestPayload,
    buildResendRequestPayload,
    createConversationActions,
} from './conversation-actions.js';

const baseChatState = {
    agentSelections: {},
    chatUsesAutoRoute: false,
    chatUsesDefaultAgent: false,
    composerText: '',
    defaultAgent: null,
    editingText: '',
    executionMode: 'background' as const,
    draftChatId: null,
    selectedAgent: 'codex',
    selectedChatId: 'chat-123',
};

test('buildChatRequestPayload preserves agent and execution mode', () => {
    assert.deepEqual(buildChatRequestPayload(baseChatState, 'ship it'), {
        agent: 'codex',
        text: 'ship it',
        channel: 'web',
        chatId: 'chat-123',
        userId: 'web-ui',
        executionMode: 'background',
    });
});

test('buildEditRequestPayload preserves execution mode for edits', () => {
    assert.deepEqual(buildEditRequestPayload(baseChatState, 'updated text'), {
        agent: 'codex',
        text: 'updated text',
        executionMode: 'background',
    });
});

test('buildResendRequestPayload preserves execution mode for resend', () => {
    assert.deepEqual(buildResendRequestPayload(baseChatState), {
        agent: 'codex',
        channel: 'web',
        chatId: 'chat-123',
        userId: 'web-ui',
        executionMode: 'background',
    });
});

test('handleSelectChat clears previous thread state before async reload', () => {
    const calls: Array<[string, unknown]> = [];
    const actions = createConversationActions({
        chat: baseChatState,
        loaders: {
            async loadChatList() {},
            async loadMessagesPanel() {},
            async loadToolLogsPanel() {},
        },
        setters: {
            chat: {
                setAgentSelections() {
                    throw new Error('unused');
                },
                setChats() {
                    throw new Error('unused');
                },
                setComposerText() {
                    throw new Error('unused');
                },
                setDefaultAgent() {
                    throw new Error('unused');
                },
                setDraftChatId() {
                    throw new Error('unused');
                },
                setEditingMessageId(value) {
                    calls.push(['setEditingMessageId', value]);
                },
                setEditingText(value) {
                    calls.push(['setEditingText', value]);
                },
                setExecutionMode() {
                    throw new Error('unused');
                },
                setLastRun() {
                    throw new Error('unused');
                },
                setMessages(value) {
                    calls.push(['setMessages', value]);
                },
                setSelectedChatId(value) {
                    calls.push(['setSelectedChatId', value]);
                },
                setSubmitting() {
                    throw new Error('unused');
                },
                setToolLogs(value) {
                    calls.push(['setToolLogs', value]);
                },
            },
            ui: {
                setActionError(value) {
                    calls.push(['setActionError', value]);
                },
                setDashboardError() {
                    throw new Error('unused');
                },
                setInspectorTab() {
                    throw new Error('unused');
                },
            },
        },
    });

    actions.handleSelectChat('chat-456');

    assert.deepEqual(calls, [
        ['setSelectedChatId', 'chat-456'],
        ['setMessages', []],
        ['setToolLogs', []],
        ['setEditingMessageId', null],
        ['setEditingText', ''],
        ['setActionError', ''],
    ]);
});
