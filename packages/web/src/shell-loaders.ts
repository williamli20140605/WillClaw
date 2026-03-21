import { startTransition, type Dispatch, type SetStateAction } from 'react';

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
    SearchScope,
    StatusPayload,
    StoredMessage,
    ToolLogEntry,
} from './ui-types.js';
import { WEB_CHANNEL } from './ui-types.js';
import { isSearchCommand, readJson } from './ui-helpers.js';

interface CreateShellLoadersOptions {
    draftChatId: string | null;
    searchScope: SearchScope;
    selectedChatId: string;
    setAuthSessions: Dispatch<SetStateAction<AuthSessionSummary[]>>;
    setAuthStatus: Dispatch<SetStateAction<AuthStatusPayload | null>>;
    setActionError: Dispatch<SetStateAction<string>>;
    setAuthTokenSummaries: Dispatch<SetStateAction<AuthTokenSummary[]>>;
    setChats: Dispatch<SetStateAction<ChatSummary[]>>;
    setCronState: Dispatch<SetStateAction<CronPayload | null>>;
    setDashboardError: Dispatch<SetStateAction<string>>;
    setDraftChatId: Dispatch<SetStateAction<string | null>>;
    setMessages: Dispatch<SetStateAction<StoredMessage[]>>;
    setPairingState: Dispatch<SetStateAction<PairingPayload | null>>;
    setProviderHealth: Dispatch<SetStateAction<ProviderHealthEntry[]>>;
    setQueueSummaries: Dispatch<SetStateAction<QueueSummary[]>>;
    setRoutePreview: Dispatch<SetStateAction<RoutePlan | null>>;
    setSearchLoading: Dispatch<SetStateAction<boolean>>;
    setSearchResults: Dispatch<SetStateAction<MemorySearchResult | null>>;
    setSelectedChatId: Dispatch<SetStateAction<string>>;
    setStatus: Dispatch<SetStateAction<StatusPayload | null>>;
    setToolLogs: Dispatch<SetStateAction<ToolLogEntry[]>>;
}

export function createShellLoaders({
    draftChatId,
    searchScope,
    selectedChatId,
    setAuthSessions,
    setAuthStatus,
    setActionError,
    setAuthTokenSummaries,
    setChats,
    setCronState,
    setDashboardError,
    setDraftChatId,
    setMessages,
    setPairingState,
    setProviderHealth,
    setQueueSummaries,
    setRoutePreview,
    setSearchLoading,
    setSearchResults,
    setSelectedChatId,
    setStatus,
    setToolLogs,
}: CreateShellLoadersOptions) {
    async function loadAuthStatus(): Promise<AuthStatusPayload> {
        const payload = await readJson<AuthStatusPayload>('/api/auth/status');
        startTransition(() => {
            setAuthStatus(payload);
        });
        return payload;
    }

    async function loadStatusPanel(): Promise<void> {
        const payload = await readJson<StatusPayload>('/api/status');
        startTransition(() => {
            setStatus(payload);
        });
    }

    async function loadProviderHealthPanel(): Promise<void> {
        const payload = await readJson<ProviderHealthEntry[]>(
            '/api/providers/health',
        );
        startTransition(() => {
            setProviderHealth(payload);
        });
    }

    async function loadAuthAdminPanel(): Promise<void> {
        try {
            const [tokensPayload, sessionsPayload] = await Promise.all([
                readJson<{ tokens: AuthTokenSummary[] }>('/api/auth/tokens'),
                readJson<{ sessions: AuthSessionSummary[] }>('/api/auth/sessions'),
            ]);
            startTransition(() => {
                setAuthTokenSummaries(tokensPayload.tokens);
                setAuthSessions(sessionsPayload.sessions);
            });
        } catch {
            startTransition(() => {
                setAuthTokenSummaries([]);
                setAuthSessions([]);
            });
        }
    }

    async function loadPairingPanel(): Promise<void> {
        const payload = await readJson<PairingPayload>('/api/pairing');
        startTransition(() => {
            setPairingState(payload);
        });
    }

    async function loadChatList(): Promise<void> {
        const currentDraftId = draftChatId;
        const payload = await readJson<ChatSummary[]>(
            `/api/chats?channel=${WEB_CHANNEL}&limit=24`,
        );
        const chatIds = new Set(payload.map((chat) => chat.chatId));

        startTransition(() => {
            setChats(payload);
            setDraftChatId((current) =>
                current && chatIds.has(current) ? null : current,
            );
            setSelectedChatId((current) => {
                if (chatIds.has(current) || current === currentDraftId) {
                    return current;
                }

                return payload[0]?.chatId ?? current;
            });
        });
    }

    async function loadMessagesPanel(chatId = selectedChatId): Promise<void> {
        const params = new URLSearchParams({
            channel: WEB_CHANNEL,
            chatId,
            limit: '120',
            includeRevoked: 'true',
        });
        const payload = await readJson<StoredMessage[]>(
            `/api/messages?${params.toString()}`,
        );
        startTransition(() => {
            setMessages(payload);
        });
    }

    async function loadToolLogsPanel(chatId = selectedChatId): Promise<void> {
        const params = new URLSearchParams({
            limit: '16',
            chatId,
        });
        const payload = await readJson<ToolLogEntry[]>(
            `/api/logs/tools?${params.toString()}`,
        );
        startTransition(() => {
            setToolLogs(payload);
        });
    }

    async function loadSchedulerPanel(): Promise<void> {
        const payload = await readJson<CronPayload>('/api/cron');
        startTransition(() => {
            setCronState(payload);
        });
    }

    async function loadQueuePanel(): Promise<void> {
        const payload = await readJson<QueueSummary[]>(
            `/api/queues?channel=${WEB_CHANNEL}`,
        );
        startTransition(() => {
            setQueueSummaries(payload);
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
            setDashboardError('');
        } catch (error) {
            setDashboardError(
                error instanceof Error
                    ? error.message
                    : 'Failed to load shell data.',
            );
        }
    }

    async function loadSearch(query: string): Promise<void> {
        if (query.length < 2) {
            setSearchResults(null);
            return;
        }

        setSearchLoading(true);

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
                setSearchResults(payload);
            });
        } catch (error) {
            setActionError(
                error instanceof Error ? error.message : 'Search request failed.',
            );
        } finally {
            setSearchLoading(false);
        }
    }

    async function loadRoutePreview(text: string): Promise<void> {
        if (!text || isSearchCommand(text)) {
            setRoutePreview(null);
            return;
        }

        try {
            const params = new URLSearchParams({ text });
            const payload = await readJson<RoutePlan>(
                `/api/route-preview?${params.toString()}`,
            );
            startTransition(() => {
                setRoutePreview(payload);
            });
        } catch {
            setRoutePreview(null);
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
