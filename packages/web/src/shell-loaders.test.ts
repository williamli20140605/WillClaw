import assert from 'node:assert/strict';
import test from 'node:test';

import {
    resolveSelectedChatIdAfterChatListRefresh,
    shouldApplyChatPanelPayload,
} from './shell-loaders.js';

test('shouldApplyChatPanelPayload only accepts the latest request for the selected chat', () => {
    assert.equal(
        shouldApplyChatPanelPayload({
            latestRequestId: 4,
            requestId: 4,
            requestedChatId: 'chat-2',
            selectedChatId: 'chat-2',
        }),
        true,
    );
    assert.equal(
        shouldApplyChatPanelPayload({
            latestRequestId: 4,
            requestId: 3,
            requestedChatId: 'chat-2',
            selectedChatId: 'chat-2',
        }),
        false,
    );
    assert.equal(
        shouldApplyChatPanelPayload({
            latestRequestId: 4,
            requestId: 4,
            requestedChatId: 'chat-1',
            selectedChatId: 'chat-2',
        }),
        false,
    );
});

test('resolveSelectedChatIdAfterChatListRefresh preserves a newly created draft selection', () => {
    assert.equal(
        resolveSelectedChatIdAfterChatListRefresh({
            availableChatIds: new Set(['chat-1', 'chat-2']),
            currentSelectedChatId: 'chat-draft',
            fallbackChatId: 'chat-1',
            latestDraftChatId: 'chat-draft',
            requestedSelectedChatId: 'chat-1',
        }),
        'chat-draft',
    );
});

test('resolveSelectedChatIdAfterChatListRefresh falls back only when selection did not change', () => {
    assert.equal(
        resolveSelectedChatIdAfterChatListRefresh({
            availableChatIds: new Set(['chat-2']),
            currentSelectedChatId: 'chat-missing',
            fallbackChatId: 'chat-2',
            latestDraftChatId: null,
            requestedSelectedChatId: 'chat-missing',
        }),
        'chat-2',
    );
    assert.equal(
        resolveSelectedChatIdAfterChatListRefresh({
            availableChatIds: new Set(['chat-2']),
            currentSelectedChatId: 'chat-local-change',
            fallbackChatId: 'chat-2',
            latestDraftChatId: null,
            requestedSelectedChatId: 'chat-missing',
        }),
        'chat-local-change',
    );
});

test('shouldApplyChatPanelPayload rejects stale responses after later renders advance the request id', () => {
    const requestIdFromOldRender = 2;
    const latestSharedRequestId = 3;

    assert.equal(
        shouldApplyChatPanelPayload({
            latestRequestId: latestSharedRequestId,
            requestId: requestIdFromOldRender,
            requestedChatId: 'chat-1',
            selectedChatId: 'chat-1',
        }),
        false,
    );
});
