import { startTransition } from 'react';

import type {
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
    getSelectedChatId(): ShellChatState['selectedChatId'];
    searchScope: ShellSearchState['scope'];
}

interface CreateShellLoadersOptions {
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

export function createShellLoaders({
    selection,
    setters,
}: CreateShellLoadersOptions) {
    const { searchScope } = selection;
    const { auth, chat, pairing, runtime, search, ui } = setters;
    let latestChatListRequest = 0;
    let latestMessagesPanelRequest = 0;
    let latestToolLogsPanelRequest = 0;

    const getSelectedChatId = () => selection.getSelectedChatId();
    const getDraftChatId = () => selection.getDraftChatId();

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
        const requestId = ++latestChatListRequest;
        const requestedSelectedChatId = getSelectedChatId();
        const payload = await readJson<ChatSummary[]>(
            `/api/chats?channel=${WEB_CHANNEL}&limit=24`,
        );
        const chatIds = new Set(payload.map((chat) => chat.chatId));

        if (requestId !== latestChatListRequest) {
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
        const requestId = ++latestMessagesPanelRequest;
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
                latestRequestId: latestMessagesPanelRequest,
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
        const requestId = ++latestToolLogsPanelRequest;
        const params = new URLSearchParams({
            limit: '16',
            chatId,
        });
        const payload = await readJson<ToolLogEntry[]>(
            `/api/logs/tools?${params.toString()}`,
        );

        if (
            !shouldApplyChatPanelPayload({
                latestRequestId: latestToolLogsPanelRequest,
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
        const payload = await readJson<QueueSummary[]>(
            `/api/queues?channel=${WEB_CHANNEL}`,
        );
        startTransition(() => {
            runtime.setQueueSummaries(payload);
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
            search.setResults(null);
            return;
        }

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
            startTransition(() => {
                search.setResults(payload);
            });
        } catch (error) {
            ui.setActionError(
                error instanceof Error ? error.message : 'Search request failed.',
            );
        } finally {
            search.setLoading(false);
        }
    }

    async function loadRoutePreview(
        text: string,
        selectedAgent?: string | null,
    ): Promise<void> {
        if (!text || isSearchCommand(text)) {
            runtime.setRoutePreview(null);
            return;
        }

        try {
            const params = new URLSearchParams({ text });
            if (selectedAgent) {
                params.set('agent', selectedAgent);
            }
            const payload = await readJson<RoutePlan>(
                `/api/route-preview?${params.toString()}`,
            );
            startTransition(() => {
                runtime.setRoutePreview(payload);
            });
        } catch {
            runtime.setRoutePreview(null);
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
