import assert from 'node:assert/strict';
import test from 'node:test';

import {
    HttpError,
    conversationScopeLabel,
    createDraftChatId,
    healthyConfiguredProviderActions,
    isUnauthorizedHttpError,
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
                channel: 'web',
                chatId: 'chat-draft',
                isDraft: true,
                messageCount: 0,
                preview: 'Fresh conversation',
                role: 'user',
                updatedAt: '2026-03-22T00:00:00.000Z',
            },
            'chat-draft',
        ),
        'draft thread',
    );
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

test('isUnauthorizedHttpError only matches 401 http failures', () => {
    assert.equal(isUnauthorizedHttpError(new HttpError('Unauthorized', 401)), true);
    assert.equal(
        isUnauthorizedHttpError(new HttpError('Invalid bearer token or session', 401)),
        true,
    );
    assert.equal(isUnauthorizedHttpError(new HttpError('Forbidden', 403)), false);
    assert.equal(isUnauthorizedHttpError(new Error('Unauthorized')), false);
});

test('healthyConfiguredProviderActions ignores unconfigured healthy actions', () => {
    const actions = healthyConfiguredProviderActions(
        [
            {
                tool: 'browser',
                provider: 'system-open',
                configured: true,
                available: true,
                healthy: true,
                detail: 'configured',
                actions: [
                    {
                        action: 'open',
                        available: true,
                        healthy: true,
                        detail: 'open',
                    },
                ],
            },
            {
                tool: 'browser',
                provider: 'agent-browser',
                configured: false,
                available: true,
                healthy: true,
                detail: 'unconfigured',
                actions: [
                    {
                        action: 'snapshot',
                        available: true,
                        healthy: true,
                        detail: 'snapshot',
                    },
                ],
            },
        ],
        'browser',
    );

    assert.deepEqual(actions, ['open']);
});
