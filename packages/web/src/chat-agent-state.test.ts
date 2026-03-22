import assert from 'node:assert/strict';
import test from 'node:test';

import {
    applyChatAgentSelection,
    migrateChatAgentSelection,
    resolveChatAgentState,
    sanitizeChatAgentSelections,
    sanitizeDefaultAgent,
} from './chat-agent-state.js';
import {
    AUTO_ROUTE_AGENT_SELECTION,
    INHERIT_DEFAULT_AGENT_SELECTION,
} from './ui-helpers.js';

test('resolveChatAgentState falls back to auto routing without defaults', () => {
    const result = resolveChatAgentState({
        agentSelections: {},
        defaultAgent: null,
        selectedChatId: 'chat-1',
    });

    assert.deepEqual(result, {
        chatUsesAutoRoute: false,
        chatUsesDefaultAgent: true,
        selectedAgent: null,
    });
});

test('resolveChatAgentState inherits the default agent when chat has no override', () => {
    const result = resolveChatAgentState({
        agentSelections: {},
        defaultAgent: 'codex',
        selectedChatId: 'chat-1',
    });

    assert.deepEqual(result, {
        chatUsesAutoRoute: false,
        chatUsesDefaultAgent: true,
        selectedAgent: 'codex',
    });
});

test('resolveChatAgentState respects an explicit auto-route override', () => {
    const result = resolveChatAgentState({
        agentSelections: {
            'chat-1': AUTO_ROUTE_AGENT_SELECTION,
        },
        defaultAgent: 'codex',
        selectedChatId: 'chat-1',
    });

    assert.deepEqual(result, {
        chatUsesAutoRoute: true,
        chatUsesDefaultAgent: false,
        selectedAgent: null,
    });
});

test('resolveChatAgentState respects an explicit agent override', () => {
    const result = resolveChatAgentState({
        agentSelections: {
            'chat-1': 'claude-code',
        },
        defaultAgent: 'codex',
        selectedChatId: 'chat-1',
    });

    assert.deepEqual(result, {
        chatUsesAutoRoute: false,
        chatUsesDefaultAgent: false,
        selectedAgent: 'claude-code',
    });
});

test('applyChatAgentSelection stores explicit selections', () => {
    const result = applyChatAgentSelection({
        agentSelections: {},
        selectedChatId: 'chat-1',
        selection: 'codex',
    });

    assert.deepEqual(result, {
        'chat-1': 'codex',
    });
});

test('applyChatAgentSelection removes overrides when inheriting the default', () => {
    const result = applyChatAgentSelection({
        agentSelections: {
            'chat-1': 'codex',
            'chat-2': AUTO_ROUTE_AGENT_SELECTION,
        },
        selectedChatId: 'chat-1',
        selection: INHERIT_DEFAULT_AGENT_SELECTION,
    });

    assert.deepEqual(result, {
        'chat-2': AUTO_ROUTE_AGENT_SELECTION,
    });
});

test('migrateChatAgentSelection moves explicit overrides from drafts to real chats', () => {
    const result = migrateChatAgentSelection({
        agentSelections: {
            draft: AUTO_ROUTE_AGENT_SELECTION,
            existing: 'codex',
        },
        fromChatId: 'draft',
        toChatId: 'chat-1',
    });

    assert.deepEqual(result, {
        'chat-1': AUTO_ROUTE_AGENT_SELECTION,
        existing: 'codex',
    });
});

test('sanitizeChatAgentSelections drops selections for agents that are no longer configured', () => {
    const result = sanitizeChatAgentSelections({
        agentSelections: {
            'chat-1': 'codex',
            'chat-2': AUTO_ROUTE_AGENT_SELECTION,
            'chat-3': 'retired-agent',
        },
        configuredAgents: ['codex', 'claude-code'],
    });

    assert.deepEqual(result, {
        'chat-1': 'codex',
        'chat-2': AUTO_ROUTE_AGENT_SELECTION,
    });
});

test('sanitizeDefaultAgent clears a default agent that is no longer configured', () => {
    assert.equal(
        sanitizeDefaultAgent({
            defaultAgent: 'retired-agent',
            configuredAgents: ['codex', 'claude-code'],
        }),
        null,
    );
});
