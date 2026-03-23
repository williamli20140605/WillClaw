import { startTransition } from 'react';

import type {
    ActiveRun,
    AuthSessionSummary,
    AuthStatusPayload,
    AuthTokenSummary,
    ChatSummary,
    CronPayload,
    MemorySearchResult,
    PairingPayload,
    ProviderHealthEntry,
    QueueSummary,
    RoutePlan,
    StatusPayload,
    StoredMessage,
    ToolLogEntry,
} from './ui-types.js';
import type {
    ShellChatState,
    ShellSearchState,
    ShellSetters,
} from './shell-state-types.js';
import { WEB_CHANNEL } from './ui-types.js';
import { isSearchCommand, readJson } from './ui-helpers.js';

interface ShellLoaderSelection {
    getDraftChatId(): ShellChatState['draftChatId'];
    getSearchScope(): ShellSearchState['scope'];
    getSelectedChatId(): ShellChatState['selectedChatId'];
}

interface ShellLoaderRequestState {
    chatList: number;
    messages: number;
    queue: number;
    routePreview: number;
    search: number;
    toolLogs: number;
}

interface CreateShellLoadersOptions {
    requestState: ShellLoaderRequestState;
    selection: ShellLoaderSelection;
    setters: ShellSetters;
}

export function shouldApplyChatPanelPayload(input: {
    latestRequestId: number;
    requestId: number;
    requestedChatId: string;
    selectedChatId: string;
}): boolean {
    return (
        input.requestId === input.latestRequestId &&
        input.requestedChatId === input.selectedChatId
    );
}

export function resolveSelectedChatIdAfterChatListRefresh(input: {
    availableChatIds: Set<string>;
    currentSelectedChatId: string;
    fallbackChatId: string | undefined;
    latestDraftChatId: string | null;
    requestedSelectedChatId: string;
}): string {
    if (
        input.availableChatIds.has(input.currentSelectedChatId) ||
        input.currentSelectedChatId === input.latestDraftChatId
    ) {
        return input.currentSelectedChatId;
    }

    if (input.currentSelectedChatId !== input.requestedSelectedChatId) {
        return input.currentSelectedChatId;
    }

    return input.fallbackChatId ?? input.currentSelectedChatId;
}

export function syncActiveRunsWithQueueSummaries(input: {
    currentActiveRuns: ActiveRun[];
    queueSummaries: QueueSummary[];
}): ActiveRun[] {
    const nonWebRuns = input.currentActiveRuns.filter(
        (run) => run.channel !== WEB_CHANNEL,
    );
    const currentByRunId = new Map(
        input.currentActiveRuns.map((run) => [run.runId, run] as const),
    );
    const webRuns = input.queueSummaries.flatMap((summary) =>
        summary.runs.map((run) => {
            const existing = currentByRunId.get(run.runId);
            const existingRunningRun =
                existing?.status === 'running' ? existing : null;
            const startedAt = run.startedAt ?? existing?.startedAt ?? '';

            if (run.status === 'queued') {
                return {
                    runId: run.runId,
                    channel: run.channel,
                    chatId: run.chatId,
                    startedAt,
                    status: 'queued' as const,
                    phase:
                        typeof run.ahead === 'number' && Number.isFinite(run.ahead)
                            ? `queued · ${run.ahead} ahead`
                            : 'queued',
                    ...(run.agent
                        ? { agent: run.agent }
                        : existing?.agent
                            ? { agent: existing.agent }
                            : {}),
                    ...(existing?.executionMode
                        ? { executionMode: existing.executionMode }
                        : {}),
                };
            }

            return {
                runId: run.runId,
                channel: run.channel,
                chatId: run.chatId,
                startedAt,
                status: 'running' as const,
                phase:
                    existingRunningRun?.phase ??
                    (run.agent ? `running ${run.agent}` : 'running'),
                ...(run.agent
                    ? { agent: run.agent }
                    : existing?.agent
                        ? { agent: existing.agent }
                        : {}),
                ...(existing?.executionMode
                    ? { executionMode: existing.executionMode }
                    : {}),
                ...(existing?.explicitAgent
                    ? { explicitAgent: existing.explicitAgent }
                    : {}),
                ...(existing?.fallbackChain
                    ? { fallbackChain: existing.fallbackChain }
                    : {}),
                ...(existing?.reason ? { reason: existing.reason } : {}),
                ...(existing?.latestError
                    ? { latestError: existing.latestError }
                    : {}),
                ...(existing?.streamContent
                    ? { streamContent: existing.streamContent }
                    : {}),
                ...(existing?.streamParser
                    ? { streamParser: existing.streamParser }
                    : {}),
                ...(existing?.streamUpdatedAt
                    ? { streamUpdatedAt: existing.streamUpdatedAt }
                    : {}),
            };
        }),
    );

    return [...webRuns, ...nonWebRuns].slice(0, 8);
}

export function createShellLoaders({
    requestState,
    selection,
    setters,
}: CreateShellLoadersOptions) {
    const { auth, chat, pairing, runtime, search, ui } = setters;

    const getSelectedChatId = () => selection.getSelectedChatId();
    const getDraftChatId = () => selection.getDraftChatId();
    const getSearchScope = () => selection.getSearchScope();

    async function loadAuthStatus(): Promise<AuthStatusPayload> {
        const payload = await readJson<AuthStatusPayload>('/api/auth/status');
        startTransition(() => {
            auth.setStatus(payload);
        });
        return payload;
    }

    async function loadStatusPanel(): Promise<void> {
        const payload = await readJson<StatusPayload>('/api/status');
        startTransition(() => {
            runtime.setStatus(payload);
        });
    }

    async function loadProviderHealthPanel(): Promise<void> {
        const payload = await readJson<ProviderHealthEntry[]>(
            '/api/providers/health',
        );
        startTransition(() => {
            runtime.setProviderHealth(payload);
        });
    }

    async function loadAuthAdminPanel(): Promise<void> {
        try {
            const [tokensPayload, sessionsPayload] = await Promise.all([
                readJson<{ tokens: AuthTokenSummary[] }>('/api/auth/tokens'),
                readJson<{ sessions: AuthSessionSummary[] }>('/api/auth/sessions'),
            ]);
            startTransition(() => {
                auth.setTokenSummaries(tokensPayload.tokens);
                auth.setSessions(sessionsPayload.sessions);
            });
        } catch {
            startTransition(() => {
                auth.setTokenSummaries([]);
                auth.setSessions([]);
            });
        }
    }

    async function loadPairingPanel(): Promise<void> {
        const payload = await readJson<PairingPayload>('/api/pairing');
        startTransition(() => {
            pairing.setState(payload);
        });
    }

    async function loadChatList(): Promise<void> {
        const requestId = ++requestState.chatList;
        const requestedSelectedChatId = getSelectedChatId();
        const payload = await readJson<ChatSummary[]>(
            `/api/chats?channel=${WEB_CHANNEL}&limit=24`,
        );
        const chatIds = new Set(payload.map((chat) => chat.chatId));

        if (requestId !== requestState.chatList) {
            return;
        }

        startTransition(() => {
            chat.setChats(payload);
            chat.setDraftChatId((current) =>
                current && chatIds.has(current) ? null : current,
            );
            chat.setSelectedChatId((current) => {
                return resolveSelectedChatIdAfterChatListRefresh({
                    availableChatIds: chatIds,
                    currentSelectedChatId: current,
                    fallbackChatId: payload[0]?.chatId,
                    latestDraftChatId: getDraftChatId(),
                    requestedSelectedChatId,
                });
            });
        });
    }

    async function loadMessagesPanel(chatId = getSelectedChatId()): Promise<void> {
        const requestId = ++requestState.messages;
        const params = new URLSearchParams({
            channel: WEB_CHANNEL,
            chatId,
            limit: '120',
            includeRevoked: 'true',
        });
        const payload = await readJson<StoredMessage[]>(
            `/api/messages?${params.toString()}`,
        );

        if (
            !shouldApplyChatPanelPayload({
                latestRequestId: requestState.messages,
                requestId,
                requestedChatId: chatId,
                selectedChatId: getSelectedChatId(),
            })
        ) {
            return;
        }

        startTransition(() => {
            chat.setMessages(payload);
        });
    }

    async function loadToolLogsPanel(chatId = getSelectedChatId()): Promise<void> {
        const requestId = ++requestState.toolLogs;
        const params = new URLSearchParams({
            limit: '16',
            chatId,
        });
        const payload = await readJson<ToolLogEntry[]>(
            `/api/logs/tools?${params.toString()}`,
        );

        if (
            !shouldApplyChatPanelPayload({
                latestRequestId: requestState.toolLogs,
                requestId,
                requestedChatId: chatId,
                selectedChatId: getSelectedChatId(),
            })
        ) {
            return;
        }

        startTransition(() => {
            chat.setToolLogs(payload);
        });
    }

    async function loadSchedulerPanel(): Promise<void> {
        const payload = await readJson<CronPayload>('/api/cron');
        startTransition(() => {
            runtime.setTasks(payload);
        });
    }

    async function loadQueuePanel(): Promise<void> {
        const requestId = ++requestState.queue;
        const payload = await readJson<QueueSummary[]>(
            `/api/queues?channel=${WEB_CHANNEL}`,
        );

        if (requestId !== requestState.queue) {
            return;
        }

        startTransition(() => {
            runtime.setQueueSummaries(payload);
            runtime.setActiveRuns((current) =>
                syncActiveRunsWithQueueSummaries({
                    currentActiveRuns: current,
                    queueSummaries: payload,
                }),
            );
        });
    }

    async function loadShellPanels(): Promise<void> {
        try {
            await Promise.all([
                loadAuthAdminPanel(),
                loadStatusPanel(),
                loadProviderHealthPanel(),
                loadPairingPanel(),
                loadChatList(),
                loadSchedulerPanel(),
                loadQueuePanel(),
            ]);
            ui.setDashboardError('');
        } catch (error) {
            ui.setDashboardError(
                error instanceof Error
                    ? error.message
                    : 'Failed to load shell data.',
            );
        }
    }

    async function loadSearch(query: string): Promise<void> {
        if (query.length < 2) {
            requestState.search += 1;
            search.setResults(null);
            search.setLoading(false);
            return;
        }

        const requestId = ++requestState.search;
        const searchScope = getSearchScope();
        search.setLoading(true);

        try {
            const params = new URLSearchParams({
                query,
                messageLimit:
                    searchScope === 'files' ||
                    searchScope === 'memory' ||
                    searchScope === 'daily_note'
                        ? '0'
                        : '6',
                fileLimit: searchScope === 'messages' ? '0' : '6',
            });

            if (searchScope === 'memory') {
                params.set('fileType', 'memory');
            }

            if (searchScope === 'daily_note') {
                params.set('fileType', 'daily_note');
            }

            const payload = await readJson<MemorySearchResult>(
                `/api/memory/search?${params.toString()}`,
            );

            if (requestId !== requestState.search) {
                return;
            }

            startTransition(() => {
                search.setResults(payload);
            });
        } catch (error) {
            if (requestId !== requestState.search) {
                return;
            }

            ui.setActionError(
                error instanceof Error ? error.message : 'Search request failed.',
            );
        } finally {
            if (requestId === requestState.search) {
                search.setLoading(false);
            }
        }
    }

    async function loadRoutePreview(
        text: string,
        selectedAgent?: string | null,
    ): Promise<void> {
        if (!text || isSearchCommand(text)) {
            requestState.routePreview += 1;
            runtime.setRoutePreview(null);
            return;
        }

        const requestId = ++requestState.routePreview;

        try {
            const params = new URLSearchParams({ text });
            if (selectedAgent) {
                params.set('agent', selectedAgent);
            }
            const payload = await readJson<RoutePlan>(
                `/api/route-preview?${params.toString()}`,
            );

            if (requestId !== requestState.routePreview) {
                return;
            }

            startTransition(() => {
                runtime.setRoutePreview(payload);
            });
        } catch {
            if (requestId === requestState.routePreview) {
                runtime.setRoutePreview(null);
            }
        }
    }

    return {
        loadAuthAdminPanel,
        loadAuthStatus,
        loadChatList,
        loadMessagesPanel,
        loadPairingPanel,
        loadProviderHealthPanel,
        loadQueuePanel,
        loadRoutePreview,
        loadSchedulerPanel,
        loadSearch,
        loadShellPanels,
        loadStatusPanel,
        loadToolLogsPanel,
    };
}
