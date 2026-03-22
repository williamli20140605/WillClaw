import assert from 'node:assert/strict';
import test from 'node:test';

import {
    conversationScopeLabel,
    createDraftChatId,
    isSearchCommand,
    routeReasonLabel,
} from './ui-helpers.js';

test('routeReasonLabel covers all current router reasons', () => {
    assert.equal(routeReasonLabel('explicit'), 'explicit target');
    assert.equal(routeReasonLabel('mode_hint'), 'mode hint');
    assert.equal(routeReasonLabel('hosted_tools'), 'hosted tools');
    assert.equal(routeReasonLabel('long_context'), 'long context');
    assert.equal(routeReasonLabel('read_only_coding'), 'read-only coding');
    assert.equal(routeReasonLabel('coding'), 'coding intent');
    assert.equal(routeReasonLabel('simple_qa'), 'simple qa');
});

test('createDraftChatId returns unique ids across consecutive calls', () => {
    const first = createDraftChatId();
    const second = createDraftChatId();

    assert.match(first, /^chat-/);
    assert.match(second, /^chat-/);
    assert.notEqual(first, second);
});

test('conversationScopeLabel hides raw ids behind user-facing thread labels', () => {
    assert.equal(conversationScopeLabel(null, 'default'), 'general shell');
    assert.equal(conversationScopeLabel(null, 'chat-draft'), 'draft thread');
    assert.equal(
        conversationScopeLabel(
            {
                agent: 'codex',
                channel: 'web',
                chatId: 'chat-1',
                messageCount: 3,
                preview: 'Investigate mobile layout issue',
                role: 'assistant',
                updatedAt: '2026-03-22T00:00:00.000Z',
            },
            'chat-1',
        ),
        'tracked thread',
    );
});

test('isSearchCommand only matches the builtin slash command token', () => {
    assert.equal(isSearchCommand('/search'), true);
    assert.equal(isSearchCommand('/search release plan'), true);
    assert.equal(isSearchCommand('/searcher release plan'), false);
    assert.equal(isSearchCommand('please /search release plan'), false);
});
