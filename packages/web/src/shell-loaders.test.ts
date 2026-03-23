import assert from 'node:assert/strict';
import test from 'node:test';

import {
    createShellLoaders,
    resolveSelectedChatIdAfterChatListRefresh,
    syncActiveRunsWithQueueSummaries,
    shouldApplyChatPanelPayload,
} from './shell-loaders.js';

function createDeferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });

    return {
        promise,
        reject,
        resolve,
    };
}

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

test('syncActiveRunsWithQueueSummaries preserves richer running metadata while hydrating queue state', () => {
    assert.deepEqual(
        syncActiveRunsWithQueueSummaries({
            currentActiveRuns: [
                {
                    runId: 'run-1',
                    channel: 'web',
                    chatId: 'chat-1',
                    startedAt: '2026-03-22T00:00:00.000Z',
                    status: 'running',
                    phase: 'streaming codex',
                    agent: 'codex',
                    streamContent: 'partial output',
                    streamUpdatedAt: '2026-03-22T00:00:05.000Z',
                },
                {
                    runId: 'run-other',
                    channel: 'telegram',
                    chatId: 'chat-telegram',
                    startedAt: '2026-03-22T00:01:00.000Z',
                    status: 'running',
                    phase: 'running',
                },
            ],
            queueSummaries: [
                {
                    channel: 'web',
                    chatId: 'chat-1',
                    total: 2,
                    queued: 1,
                    running: 1,
                    runs: [
                        {
                            runId: 'run-1',
                            channel: 'web',
                            chatId: 'chat-1',
                            userId: 'web-ui',
                            userMessageId: 1,
                            status: 'running',
                            position: 1,
                            ahead: 0,
                            agent: 'codex',
                            startedAt: '2026-03-22T00:00:00.000Z',
                        },
                        {
                            runId: 'run-2',
                            channel: 'web',
                            chatId: 'chat-1',
                            userId: 'web-ui',
                            userMessageId: 2,
                            status: 'queued',
                            position: 2,
                            ahead: 1,
                            startedAt: '2026-03-22T00:00:10.000Z',
                        },
                    ],
                },
            ],
        }),
        [
            {
                runId: 'run-1',
                channel: 'web',
                chatId: 'chat-1',
                startedAt: '2026-03-22T00:00:00.000Z',
                status: 'running',
                phase: 'streaming codex',
                agent: 'codex',
                streamContent: 'partial output',
                streamUpdatedAt: '2026-03-22T00:00:05.000Z',
            },
            {
                runId: 'run-2',
                channel: 'web',
                chatId: 'chat-1',
                startedAt: '2026-03-22T00:00:10.000Z',
                status: 'queued',
                phase: 'queued · 1 ahead',
            },
            {
                runId: 'run-other',
                channel: 'telegram',
                chatId: 'chat-telegram',
                startedAt: '2026-03-22T00:01:00.000Z',
                status: 'running',
                phase: 'running',
            },
        ],
    );
});

test('syncActiveRunsWithQueueSummaries promotes stale queued metadata to running state', () => {
    assert.deepEqual(
        syncActiveRunsWithQueueSummaries({
            currentActiveRuns: [
                {
                    runId: 'run-1',
                    channel: 'web',
                    chatId: 'chat-1',
                    startedAt: '2026-03-22T00:00:00.000Z',
                    status: 'queued',
                    phase: 'queued · 2 ahead',
                },
            ],
            queueSummaries: [
                {
                    channel: 'web',
                    chatId: 'chat-1',
                    total: 1,
                    queued: 0,
                    running: 1,
                    runs: [
                        {
                            runId: 'run-1',
                            channel: 'web',
                            chatId: 'chat-1',
                            userId: 'web-ui',
                            userMessageId: 1,
                            status: 'running',
                            position: 1,
                            ahead: 0,
                            agent: 'codex',
                            startedAt: '2026-03-22T00:00:00.000Z',
                        },
                    ],
                },
            ],
        }),
        [
            {
                runId: 'run-1',
                channel: 'web',
                chatId: 'chat-1',
                startedAt: '2026-03-22T00:00:00.000Z',
                status: 'running',
                phase: 'running codex',
                agent: 'codex',
            },
        ],
    );
});

test('loadQueuePanel ignores stale responses that resolve after a newer refresh', async () => {
    const originalFetch = globalThis.fetch;
    const firstFetch = createDeferred<Response>();
    const secondFetch = createDeferred<Response>();
    let fetchCount = 0;
    let queueSummaries: unknown = null;
    let activeRuns: Array<{ runId: string }> = [];

    globalThis.fetch = (async () => {
        fetchCount += 1;
        return fetchCount === 1 ? firstFetch.promise : secondFetch.promise;
    }) as typeof fetch;

    try {
        const loaders = createShellLoaders({
            requestState: {
                chatList: 0,
                messages: 0,
                queue: 0,
                routePreview: 0,
                search: 0,
                toolLogs: 0,
            },
            selection: {
                getDraftChatId: () => null,
                getSearchScope: () => 'all',
                getSelectedChatId: () => 'chat-1',
            },
            setters: {
                auth: {},
                chat: {},
                pairing: {},
                runtime: {
                    setActiveRuns(
                        value:
                            | Array<{ runId: string }>
                            | ((current: Array<{ runId: string }>) => Array<{ runId: string }>),
                    ) {
                        activeRuns =
                            typeof value === 'function'
                                ? value(activeRuns)
                                : value;
                    },
                    setQueueSummaries(value: unknown) {
                        queueSummaries = value;
                    },
                },
                search: {},
                ui: {},
            } as never,
        });

        const staleLoad = loaders.loadQueuePanel();
        const freshLoad = loaders.loadQueuePanel();

        secondFetch.resolve({
            ok: true,
            json: async () => [
                {
                    channel: 'web',
                    chatId: 'chat-1',
                    total: 1,
                    queued: 0,
                    running: 1,
                    runs: [
                        {
                            runId: 'run-new',
                            channel: 'web',
                            chatId: 'chat-1',
                            userId: 'web-ui',
                            userMessageId: 2,
                            status: 'running',
                            position: 1,
                            ahead: 0,
                            agent: 'codex',
                            startedAt: '2026-03-22T00:00:10.000Z',
                        },
                    ],
                },
            ],
        } as Response);
        await freshLoad;

        firstFetch.resolve({
            ok: true,
            json: async () => [
                {
                    channel: 'web',
                    chatId: 'chat-1',
                    total: 1,
                    queued: 1,
                    running: 0,
                    runs: [
                        {
                            runId: 'run-old',
                            channel: 'web',
                            chatId: 'chat-1',
                            userId: 'web-ui',
                            userMessageId: 1,
                            status: 'queued',
                            position: 1,
                            ahead: 0,
                            startedAt: '2026-03-22T00:00:00.000Z',
                        },
                    ],
                },
            ],
        } as Response);
        await staleLoad;

        assert.deepEqual(queueSummaries, [
            {
                channel: 'web',
                chatId: 'chat-1',
                total: 1,
                queued: 0,
                running: 1,
                runs: [
                    {
                        runId: 'run-new',
                        channel: 'web',
                        chatId: 'chat-1',
                        userId: 'web-ui',
                        userMessageId: 2,
                        status: 'running',
                        position: 1,
                        ahead: 0,
                        agent: 'codex',
                        startedAt: '2026-03-22T00:00:10.000Z',
                    },
                ],
            },
        ]);
        assert.deepEqual(activeRuns, [
            {
                runId: 'run-new',
                channel: 'web',
                chatId: 'chat-1',
                startedAt: '2026-03-22T00:00:10.000Z',
                status: 'running',
                phase: 'running codex',
                agent: 'codex',
            },
        ]);
    } finally {
        globalThis.fetch = originalFetch;
    }
});
