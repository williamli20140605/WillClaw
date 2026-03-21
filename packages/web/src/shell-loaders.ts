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

interface ShellLoaderSelection {
    draftChatId: string | null;
    searchScope: SearchScope;
    selectedChatId: string;
}

interface ShellLoaderSetters {
    auth: {
        setSessions: Dispatch<SetStateAction<AuthSessionSummary[]>>;
        setStatus: Dispatch<SetStateAction<AuthStatusPayload | null>>;
        setTokenSummaries: Dispatch<SetStateAction<AuthTokenSummary[]>>;
    };
    chat: {
        setChats: Dispatch<SetStateAction<ChatSummary[]>>;
        setDraftChatId: Dispatch<SetStateAction<string | null>>;
        setMessages: Dispatch<SetStateAction<StoredMessage[]>>;
        setSelectedChatId: Dispatch<SetStateAction<string>>;
        setToolLogs: Dispatch<SetStateAction<ToolLogEntry[]>>;
    };
    pairing: {
        setState: Dispatch<SetStateAction<PairingPayload | null>>;
    };
    runtime: {
        setProviderHealth: Dispatch<SetStateAction<ProviderHealthEntry[]>>;
        setQueueSummaries: Dispatch<SetStateAction<QueueSummary[]>>;
        setRoutePreview: Dispatch<SetStateAction<RoutePlan | null>>;
        setStatus: Dispatch<SetStateAction<StatusPayload | null>>;
        setTasks: Dispatch<SetStateAction<CronPayload | null>>;
    };
    search: {
        setLoading: Dispatch<SetStateAction<boolean>>;
        setResults: Dispatch<SetStateAction<MemorySearchResult | null>>;
    };
    ui: {
        setActionError: Dispatch<SetStateAction<string>>;
        setDashboardError: Dispatch<SetStateAction<string>>;
    };
}

interface CreateShellLoadersOptions {
    selection: ShellLoaderSelection;
    setters: ShellLoaderSetters;
}

export function createShellLoaders({
    selection,
    setters,
}: CreateShellLoadersOptions) {
    const { draftChatId, searchScope, selectedChatId } = selection;
    const { auth, chat, pairing, runtime, search, ui } = setters;

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
        const currentDraftId = draftChatId;
        const payload = await readJson<ChatSummary[]>(
            `/api/chats?channel=${WEB_CHANNEL}&limit=24`,
        );
        const chatIds = new Set(payload.map((chat) => chat.chatId));

        startTransition(() => {
            chat.setChats(payload);
            chat.setDraftChatId((current) =>
                current && chatIds.has(current) ? null : current,
            );
            chat.setSelectedChatId((current) => {
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
            chat.setMessages(payload);
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

    async function loadRoutePreview(text: string): Promise<void> {
        if (!text || isSearchCommand(text)) {
            runtime.setRoutePreview(null);
            return;
        }

        try {
            const params = new URLSearchParams({ text });
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
