import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildChatRequestPayload,
    buildEditRequestPayload,
    buildResendRequestPayload,
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
