import { startTransition, useDeferredValue, useEffect, useState } from 'react';

import {
    DEFAULT_CHAT,
    WEB_CHANNEL,
    WEB_USER,
    type ActiveRun,
    type AssistantRouteMetadata,
    type AuthSessionSummary,
    type AuthStatusPayload,
    type AuthTokenSummary,
    type ChatResult,
    type ChatSummary,
    type CreatedAuthToken,
    type CreatedPairingInvite,
    type CronPayload,
    type InspectorTab,
    type MemorySearchResult,
    type PairingGrant,
    type PairingInvite,
    type PairingPayload,
    type ProviderHealthEntry,
    type QueueSummary,
    type RealtimeEvent,
    type RoutePlan,
    type SearchScope,
    type StatusPayload,
    type StoredMessage,
    type ToolLogEntry,
} from './ui-types.js';
import {
    buildEditedSuccessorMap,
    createDraftChatId,
    extractAssistantRouteMetadata,
    formatStructuredResult,
    isSearchCommand,
    readJson,
    readPayloadString,
    readPayloadStringArray,
    shouldTrackRecentEvent,
    upsertActiveRun,
} from './ui-helpers.js';
import {
    AuthLoadingScreen,
    AuthUnlockScreen,
} from './components/AuthShell.js';
import { ConversationComposer } from './components/ConversationComposer.js';
import { ConversationHeader } from './components/ConversationHeader.js';
import { ConversationSidebar } from './components/ConversationSidebar.js';
import { ConversationStream } from './components/ConversationStream.js';
import { InspectorPanel } from './components/InspectorPanel.js';
import { ShellTopBar } from './components/ShellTopBar.js';

export function App() {
    const [authStatus, setAuthStatus] = useState<AuthStatusPayload | null>(null);
    const [authTokenInput, setAuthTokenInput] = useState('');
    const [authBusy, setAuthBusy] = useState(false);
    const [status, setStatus] = useState<StatusPayload | null>(null);
    const [chats, setChats] = useState<ChatSummary[]>([]);
    const [selectedChatId, setSelectedChatId] = useState(DEFAULT_CHAT);
    const [draftChatId, setDraftChatId] = useState<string | null>(null);
    const [messages, setMessages] = useState<StoredMessage[]>([]);
    const [toolLogs, setToolLogs] = useState<ToolLogEntry[]>([]);
    const [cronState, setCronState] = useState<CronPayload | null>(null);
    const [queueSummaries, setQueueSummaries] = useState<QueueSummary[]>([]);
    const [composerText, setComposerText] = useState('');
    const [executionMode, setExecutionMode] = useState<'foreground' | 'background'>(
        'foreground',
    );
    const [submitting, setSubmitting] = useState(false);
    const [dashboardError, setDashboardError] = useState('');
    const [actionError, setActionError] = useState('');
    const [lastRun, setLastRun] = useState<ChatResult | null>(null);
    const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
    const [editingText, setEditingText] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchScope, setSearchScope] = useState<SearchScope>('all');
    const [searchResults, setSearchResults] = useState<MemorySearchResult | null>(
        null,
    );
    const [searchLoading, setSearchLoading] = useState(false);
    const [routePreview, setRoutePreview] = useState<RoutePlan | null>(null);
    const [realtimeConnected, setRealtimeConnected] = useState(false);
    const [activeRuns, setActiveRuns] = useState<ActiveRun[]>([]);
    const [recentEvents, setRecentEvents] = useState<RealtimeEvent[]>([]);
    const [inspectorTab, setInspectorTab] = useState<InspectorTab>('search');
    const [providerHealth, setProviderHealth] = useState<ProviderHealthEntry[]>([]);
    const [authTokenSummaries, setAuthTokenSummaries] = useState<AuthTokenSummary[]>(
        [],
    );
    const [authSessions, setAuthSessions] = useState<AuthSessionSummary[]>([]);
    const [authAdminBusy, setAuthAdminBusy] = useState(false);
    const [managedTokenId, setManagedTokenId] = useState('');
    const [managedTokenScopes, setManagedTokenScopes] = useState<string[]>([
        'api:read',
        'api:write',
    ]);
    const [latestManagedToken, setLatestManagedToken] =
        useState<CreatedAuthToken | null>(null);
    const [pairingState, setPairingState] = useState<PairingPayload | null>(null);
    const [pairingBusy, setPairingBusy] = useState(false);
    const [pairingKind, setPairingKind] = useState<'web' | 'channel'>('web');
    const [pairingChannel, setPairingChannel] = useState<'telegram' | 'discord' | 'feishu'>('telegram');
    const [pairingInvite, setPairingInvite] = useState<CreatedPairingInvite | null>(null);
    const [browserTarget, setBrowserTarget] = useState('https://example.com');
    const [browserFormFieldsText, setBrowserFormFieldsText] = useState(
        '[\n  {\n    "selector": "#email",\n    "text": "user@example.com",\n    "clear": true\n  }\n]',
    );
    const [browserSubmitSelector, setBrowserSubmitSelector] = useState(
        'button[type=submit]',
    );
    const [screenApp, setScreenApp] = useState('');
    const [screenInputText, setScreenInputText] = useState('hello from WillClaw');
    const [screenSendClear, setScreenSendClear] = useState(false);
    const [screenSendPressReturn, setScreenSendPressReturn] = useState(false);
    const [screenSendInspectAfter, setScreenSendInspectAfter] = useState(true);
    const [screenSendLaunchIfNeeded, setScreenSendLaunchIfNeeded] =
        useState(true);
    const [screenSendRequireFrontmost, setScreenSendRequireFrontmost] =
        useState(false);
    const [hostActionBusy, setHostActionBusy] = useState(false);
    const [hostActionResult, setHostActionResult] = useState('');

    const deferredSearchQuery = useDeferredValue(searchQuery.trim());
    const deferredComposerText = useDeferredValue(composerText.trim());

    const authReady = authStatus !== null;
    const authAllowsDashboard =
        authReady && (!authStatus.authRequired || authStatus.authenticated);
    const canManageAuth = authStatus?.scopes.includes('api:session') ?? false;

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
                error instanceof Error ? error.message : 'Failed to load shell data.',
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

    async function handleAuthLogin(): Promise<void> {
        const credential = authTokenInput.trim();
        if (!credential) {
            setDashboardError('Enter a bearer token or pairing code to unlock the shell.');
            return;
        }

        setAuthBusy(true);
        setDashboardError('');

        try {
            let payload: AuthStatusPayload;

            try {
                payload = await readJson<AuthStatusPayload>('/api/auth/session', {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                    },
                    body: JSON.stringify({ token: credential }),
                });
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : 'Unlock failed.';
                if (!message.toLowerCase().includes('unauthorized')) {
                    throw error;
                }

                payload = await readJson<AuthStatusPayload>('/api/auth/pairing', {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                    },
                    body: JSON.stringify({ code: credential }),
                });
            }
            startTransition(() => {
                setAuthStatus(payload);
                setAuthTokenInput('');
                setRealtimeConnected(false);
                setRecentEvents([]);
                setActiveRuns([]);
            });
            await Promise.all([
                loadShellPanels(),
                loadMessagesPanel(selectedChatId),
                loadToolLogsPanel(selectedChatId),
            ]);
        } catch (error) {
            setDashboardError(
                error instanceof Error
                    ? error.message
                    : 'Login failed with the provided token.',
            );
        } finally {
            setAuthBusy(false);
        }
    }

    async function handleAuthLogout(): Promise<void> {
        setAuthBusy(true);

        try {
            const payload = await readJson<AuthStatusPayload>('/api/auth/session', {
                method: 'DELETE',
            });
            startTransition(() => {
                setAuthStatus(payload);
                setRealtimeConnected(false);
                setRecentEvents([]);
                setActiveRuns([]);
                setMessages([]);
                setToolLogs([]);
            });
        } catch (error) {
            setDashboardError(
                error instanceof Error ? error.message : 'Logout failed.',
            );
        } finally {
            setAuthBusy(false);
        }
    }

    async function handleRevokeAuthSession(sessionId: string): Promise<void> {
        setAuthAdminBusy(true);
        setActionError('');

        try {
            await readJson<{ revoked: AuthSessionSummary }>(
                `/api/auth/sessions/${sessionId}`,
                {
                    method: 'DELETE',
                },
            );
            await loadAuthAdminPanel();
        } catch (error) {
            setActionError(
                error instanceof Error
                    ? error.message
                    : 'Failed to revoke session.',
            );
        } finally {
            setAuthAdminBusy(false);
        }
    }

    async function handleCreateManagedToken(): Promise<void> {
        setAuthAdminBusy(true);
        setActionError('');

        try {
            const payload = await readJson<CreatedAuthToken>('/api/auth/tokens', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    ...(managedTokenId.trim() ? { id: managedTokenId.trim() } : {}),
                    scopes: managedTokenScopes,
                }),
            });
            startTransition(() => {
                setLatestManagedToken(payload);
                setManagedTokenId('');
            });
            await loadAuthAdminPanel();
        } catch (error) {
            setActionError(
                error instanceof Error
                    ? error.message
                    : 'Failed to create managed auth token.',
            );
        } finally {
            setAuthAdminBusy(false);
        }
    }

    async function handleRevokeAuthToken(tokenId: string): Promise<void> {
        setAuthAdminBusy(true);
        setActionError('');

        try {
            await readJson<{ revoked: AuthTokenSummary }>(`/api/auth/tokens/${tokenId}`, {
                method: 'DELETE',
            });
            await loadAuthAdminPanel();
        } catch (error) {
            setActionError(
                error instanceof Error
                    ? error.message
                    : 'Failed to revoke managed auth token.',
            );
        } finally {
            setAuthAdminBusy(false);
        }
    }

    async function handleCreatePairingInvite(): Promise<void> {
        setPairingBusy(true);
        setActionError('');

        try {
            const payload = await readJson<CreatedPairingInvite>('/api/pairing/invites', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    kind: pairingKind,
                    ...(pairingKind === 'channel'
                        ? { channels: [pairingChannel] }
                        : {}),
                }),
            });
            startTransition(() => {
                setPairingInvite(payload);
            });
            await loadPairingPanel();
        } catch (error) {
            setActionError(
                error instanceof Error
                    ? error.message
                    : 'Failed to create pairing invite.',
            );
        } finally {
            setPairingBusy(false);
        }
    }

    async function handleRevokePairingInvite(inviteId: string): Promise<void> {
        setPairingBusy(true);
        setActionError('');

        try {
            await readJson<PairingInvite>(`/api/pairing/invites/${inviteId}/revoke`, {
                method: 'POST',
            });
            if (pairingInvite?.id === inviteId) {
                startTransition(() => {
                    setPairingInvite(null);
                });
            }
            await loadPairingPanel();
        } catch (error) {
            setActionError(
                error instanceof Error
                    ? error.message
                    : 'Failed to revoke pairing invite.',
            );
        } finally {
            setPairingBusy(false);
        }
    }

    async function handleRevokePairingGrant(grantId: string): Promise<void> {
        setPairingBusy(true);
        setActionError('');

        try {
            await readJson<PairingGrant>(`/api/pairing/grants/${grantId}/revoke`, {
                method: 'POST',
            });
            await loadPairingPanel();
        } catch (error) {
            setActionError(
                error instanceof Error
                    ? error.message
                    : 'Failed to revoke pairing grant.',
            );
        } finally {
            setPairingBusy(false);
        }
    }

    useEffect(() => {
        let cancelled = false;

        const boot = async () => {
            try {
                const payload = await loadAuthStatus();
                if (
                    cancelled ||
                    (payload.authRequired && !payload.authenticated)
                ) {
                    return;
                }

                await loadShellPanels();
            } catch (error) {
                if (!cancelled) {
                    setDashboardError(
                        error instanceof Error
                            ? error.message
                            : 'Failed to load shell data.',
                    );
                }
            }
        };

        void boot();

        const interval = window.setInterval(() => {
            void loadAuthStatus()
                .then((payload) => {
                    if (!payload.authRequired || payload.authenticated) {
                        return loadShellPanels();
                    }

                    return undefined;
                })
                .catch((error) => {
                    setDashboardError(
                        error instanceof Error
                            ? error.message
                            : 'Failed to load shell data.',
                    );
                });
        }, 30_000);

        return () => {
            cancelled = true;
            window.clearInterval(interval);
        };
    }, []);

    useEffect(() => {
        if (!authAllowsDashboard) {
            return;
        }

        void loadMessagesPanel(selectedChatId);
        void loadToolLogsPanel(selectedChatId);

        const interval = window.setInterval(() => {
            void loadMessagesPanel(selectedChatId);
            void loadToolLogsPanel(selectedChatId);
        }, 30_000);

        return () => {
            window.clearInterval(interval);
        };
    }, [authAllowsDashboard, selectedChatId]);

    useEffect(() => {
        if (!authAllowsDashboard) {
            setRealtimeConnected(false);
            return;
        }

        const source = new EventSource('/api/events');
        const eventTypes = [
            'ready',
            'chat.run.queued',
            'chat.run.started',
            'chat.run.stream.delta',
            'chat.run.completed',
            'chat.run.failed',
            'chat.run.cancelled',
            'chat.route.selected',
            'chat.agent.started',
            'chat.agent.failed',
            'chat.agent.skipped',
            'message.created',
            'message.revoked',
            'background.task.started',
            'background.task.completed',
            'background.task.failed',
            'scheduler.task.started',
            'scheduler.task.completed',
            'scheduler.task.failed',
        ] as const;

        const handleEvent = (nativeEvent: Event) => {
            const messageEvent = nativeEvent as MessageEvent<string>;

            try {
                const event = JSON.parse(messageEvent.data) as RealtimeEvent;
                if (shouldTrackRecentEvent(event.type)) {
                    setRecentEvents((current) => [event, ...current].slice(0, 12));
                }

                switch (event.type) {
                    case 'ready':
                        setRealtimeConnected(true);
                        break;
                    case 'chat.run.queued': {
                        const runId = readPayloadString(event.payload, 'runId');
                        const channel = readPayloadString(event.payload, 'channel');
                        const chatId = readPayloadString(event.payload, 'chatId');
                        const executionMode = readPayloadString(
                            event.payload,
                            'executionMode',
                        );
                        const ahead = event.payload.ahead;
                        if (!runId || !channel || !chatId) {
                            break;
                        }

                        setActiveRuns((current) =>
                            upsertActiveRun(current, {
                                runId,
                                channel,
                                chatId,
                                startedAt: event.timestamp,
                                status: 'queued',
                                phase:
                                    typeof ahead === 'number' &&
                                    Number.isFinite(ahead)
                                        ? `queued · ${ahead} ahead`
                                        : 'queued',
                                streamContent: '',
                                ...(executionMode ? { executionMode } : {}),
                            }),
                        );

                        if (channel === WEB_CHANNEL) {
                            void loadChatList();
                            void loadQueuePanel();
                            if (chatId === selectedChatId) {
                                void loadMessagesPanel(chatId);
                            }
                        }
                        break;
                    }
                    case 'chat.run.started': {
                        const runId = readPayloadString(event.payload, 'runId');
                        const channel = readPayloadString(event.payload, 'channel');
                        const chatId = readPayloadString(event.payload, 'chatId');
                        const executionMode = readPayloadString(
                            event.payload,
                            'executionMode',
                        );
                        if (!runId || !channel || !chatId) {
                            break;
                        }

                        setActiveRuns((current) =>
                            upsertActiveRun(current, {
                                runId,
                                channel,
                                chatId,
                                startedAt: event.timestamp,
                                status: 'running',
                                phase: 'running',
                                streamContent: '',
                                ...(executionMode ? { executionMode } : {}),
                            }),
                        );

                        if (channel === WEB_CHANNEL) {
                            void loadChatList();
                            void loadQueuePanel();
                            if (chatId === selectedChatId) {
                                void loadMessagesPanel(chatId);
                            }
                        }
                        break;
                    }
                    case 'chat.route.selected': {
                        const runId = readPayloadString(event.payload, 'runId');
                        const selectedAgent = readPayloadString(
                            event.payload,
                            'selectedAgent',
                        );
                        if (!runId) {
                            break;
                        }

                        setActiveRuns((current) => {
                            const existing = current.find(
                                (entry) => entry.runId === runId,
                            );
                            if (!existing) {
                                return current;
                            }

                            return upsertActiveRun(current, {
                                ...existing,
                                ...(selectedAgent ? { agent: selectedAgent } : {}),
                                ...(() => {
                                    const reason = readPayloadString(
                                        event.payload,
                                        'reason',
                                    );
                                    return reason ? { reason } : {};
                                })(),
                                ...(() => {
                                    const explicitAgent = readPayloadString(
                                        event.payload,
                                        'explicitAgent',
                                    );
                                    return explicitAgent ? { explicitAgent } : {};
                                })(),
                                ...(() => {
                                    const fallbackChain = readPayloadStringArray(
                                        event.payload,
                                        'fallbackChain',
                                    );
                                    return fallbackChain
                                        ? { fallbackChain }
                                        : {};
                                })(),
                                phase: selectedAgent
                                    ? `routing → ${selectedAgent}`
                                    : 'routing',
                            });
                        });
                        break;
                    }
                    case 'chat.agent.started': {
                        const runId = readPayloadString(event.payload, 'runId');
                        const agent = readPayloadString(event.payload, 'agent');
                        if (!runId) {
                            break;
                        }

                        setActiveRuns((current) => {
                            const existing = current.find(
                                (entry) => entry.runId === runId,
                            );
                            if (!existing) {
                                return current;
                            }

                            return upsertActiveRun(current, {
                                ...existing,
                                ...(agent ? { agent } : {}),
                                phase: agent ? `running ${agent}` : 'running',
                                streamContent: '',
                            });
                        });
                        break;
                    }
                    case 'chat.run.stream.delta': {
                        const runId = readPayloadString(event.payload, 'runId');
                        const agent = readPayloadString(event.payload, 'agent');
                        const channel = readPayloadString(event.payload, 'channel');
                        const chatId = readPayloadString(event.payload, 'chatId');
                        const content = readPayloadString(event.payload, 'content');
                        const parser = readPayloadString(event.payload, 'parser');
                        if (!runId || !channel || !chatId || !content) {
                            break;
                        }

                        setActiveRuns((current) => {
                            const existing = current.find(
                                (entry) => entry.runId === runId,
                            );
                            if (!existing) {
                                return current;
                            }

                            return upsertActiveRun(current, {
                                ...existing,
                                ...(agent ? { agent } : {}),
                                streamContent: content,
                                ...(parser ? { streamParser: parser } : {}),
                                streamUpdatedAt: event.timestamp,
                                phase: agent ? `streaming ${agent}` : 'streaming',
                            });
                        });
                        break;
                    }
                    case 'chat.agent.failed':
                    case 'chat.agent.skipped': {
                        const runId = readPayloadString(event.payload, 'runId');
                        const agent = readPayloadString(event.payload, 'agent');
                        const detail =
                            readPayloadString(event.payload, 'error') ??
                            readPayloadString(event.payload, 'reason');
                        if (!runId) {
                            break;
                        }

                        setActiveRuns((current) => {
                            const existing = current.find(
                                (entry) => entry.runId === runId,
                            );
                            if (!existing) {
                                return current;
                            }

                            return upsertActiveRun(current, {
                                ...existing,
                                ...(agent ? { agent } : {}),
                                ...(detail ? { latestError: detail } : {}),
                                phase:
                                    event.type === 'chat.agent.failed'
                                        ? `retrying after ${agent ?? 'agent'}`
                                        : `skipping ${agent ?? 'agent'}`,
                            });
                        });
                        break;
                    }
                    case 'chat.run.completed':
                    case 'chat.run.failed':
                    case 'chat.run.cancelled': {
                        const runId = readPayloadString(event.payload, 'runId');
                        const channel = readPayloadString(event.payload, 'channel');
                        const chatId = readPayloadString(event.payload, 'chatId');

                        if (runId) {
                            setActiveRuns((current) =>
                                current.filter((entry) => entry.runId !== runId),
                            );
                        }

                        if (channel === WEB_CHANNEL) {
                            void loadChatList();
                            void loadQueuePanel();
                        }

                        if (channel === WEB_CHANNEL && chatId === selectedChatId) {
                            void loadMessagesPanel(chatId);
                            void loadToolLogsPanel(chatId);
                        }
                        break;
                    }
                    case 'message.created':
                    case 'message.revoked': {
                        const channel = readPayloadString(event.payload, 'channel');
                        const chatId = readPayloadString(event.payload, 'chatId');

                        if (channel === WEB_CHANNEL) {
                            void loadChatList();
                            void loadQueuePanel();
                        }

                        if (channel === WEB_CHANNEL && chatId === selectedChatId) {
                            void loadMessagesPanel(chatId);
                            void loadToolLogsPanel(chatId);
                        }
                        break;
                    }
                    case 'background.task.started':
                    case 'background.task.completed':
                    case 'background.task.failed':
                    case 'scheduler.task.started':
                    case 'scheduler.task.completed':
                    case 'scheduler.task.failed':
                        void loadSchedulerPanel();
                        void loadShellPanels();
                        break;
                    default:
                        break;
                }
            } catch {
                setRealtimeConnected(false);
            }
        };

        source.addEventListener('open', () => {
            setRealtimeConnected(true);
        });
        source.addEventListener('error', () => {
            setRealtimeConnected(false);
        });

        for (const eventType of eventTypes) {
            source.addEventListener(eventType, handleEvent);
        }

        return () => {
            for (const eventType of eventTypes) {
                source.removeEventListener(eventType, handleEvent);
            }
            source.close();
            setRealtimeConnected(false);
        };
    }, [authAllowsDashboard, selectedChatId, draftChatId]);

    useEffect(() => {
        if (!authAllowsDashboard) {
            return;
        }

        void loadSearch(deferredSearchQuery);
    }, [authAllowsDashboard, deferredSearchQuery, searchScope]);

    useEffect(() => {
        if (!authAllowsDashboard) {
            return;
        }

        void loadRoutePreview(deferredComposerText);
    }, [authAllowsDashboard, deferredComposerText]);

    async function handleSend(): Promise<void> {
        const text = composerText.trim();
        if (!text) {
            return;
        }

        setSubmitting(true);
        setActionError('');

        try {
            const result = await readJson<ChatResult>('/api/chat', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    text,
                    channel: WEB_CHANNEL,
                    chatId: selectedChatId,
                    userId: WEB_USER,
                    executionMode,
                }),
            });

            setLastRun(result);
            setComposerText('');
            await Promise.all([
                loadChatList(),
                loadMessagesPanel(result.chatId),
                loadToolLogsPanel(result.chatId),
            ]);
        } catch (error) {
            setActionError(error instanceof Error ? error.message : 'Chat failed.');
        } finally {
            setSubmitting(false);
        }
    }

    async function handleCancelRun(runId: string): Promise<void> {
        setActionError('');

        try {
            await readJson(`/api/runs/${runId}/cancel`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    annotate: true,
                }),
            });
            await Promise.all([loadMessagesPanel(selectedChatId), loadChatList()]);
        } catch (error) {
            setActionError(
                error instanceof Error ? error.message : 'Cancel request failed.',
            );
        }
    }

    async function handleRevoke(messageId: number): Promise<void> {
        setActionError('');

        try {
            await readJson(`/api/messages/${messageId}/revoke`, {
                method: 'POST',
            });
            await Promise.all([
                loadMessagesPanel(selectedChatId),
                loadChatList(),
                loadToolLogsPanel(selectedChatId),
            ]);
        } catch (error) {
            setActionError(
                error instanceof Error ? error.message : 'Revoke failed.',
            );
        }
    }

    async function handleResend(messageId: number): Promise<void> {
        setActionError('');

        try {
            const result = await readJson<ChatResult>(`/api/messages/${messageId}/resend`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    channel: WEB_CHANNEL,
                    chatId: selectedChatId,
                    userId: WEB_USER,
                }),
            });
            setLastRun(result);
            await Promise.all([
                loadChatList(),
                loadMessagesPanel(selectedChatId),
                loadToolLogsPanel(selectedChatId),
            ]);
        } catch (error) {
            setActionError(
                error instanceof Error ? error.message : 'Resend failed.',
            );
        }
    }

    async function handleEditSave(messageId: number): Promise<void> {
        const text = editingText.trim();
        if (!text) {
            return;
        }

        setActionError('');

        try {
            const result = await readJson<{ result: ChatResult }>(
                `/api/messages/${messageId}/edit`,
                {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                    },
                    body: JSON.stringify({
                        text,
                    }),
                },
            );
            setEditingMessageId(null);
            setEditingText('');
            setLastRun(result.result);
            await Promise.all([
                loadChatList(),
                loadMessagesPanel(selectedChatId),
                loadToolLogsPanel(selectedChatId),
            ]);
        } catch (error) {
            setActionError(error instanceof Error ? error.message : 'Edit failed.');
        }
    }

    async function handleTaskRun(endpoint: string): Promise<void> {
        setActionError('');

        try {
            await readJson(endpoint, {
                method: 'POST',
            });
            await Promise.all([loadSchedulerPanel(), loadChatList()]);
        } catch (error) {
            setActionError(
                error instanceof Error ? error.message : 'Task trigger failed.',
            );
        }
    }

    async function runHostAction(
        endpoint: string,
        payload: Record<string, unknown>,
    ): Promise<void> {
        setHostActionBusy(true);
        setActionError('');

        try {
            const result = await readJson<unknown>(endpoint, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                body: JSON.stringify(payload),
            });
            setHostActionResult(formatStructuredResult(result));
            await loadToolLogsPanel(selectedChatId);
        } catch (error) {
            setActionError(
                error instanceof Error ? error.message : 'Host action failed.',
            );
        } finally {
            setHostActionBusy(false);
        }
    }

    function parseBrowserFormFields(): Array<{
        selector: string;
        text: string;
        clear?: boolean;
    }> {
        const parsed = JSON.parse(browserFormFieldsText) as unknown;
        if (!Array.isArray(parsed)) {
            throw new Error('Form fields JSON must be an array.');
        }

        const fields = parsed
            .map((entry) => {
                if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
                    return null;
                }

                const record = entry as Record<string, unknown>;
                const selector =
                    typeof record.selector === 'string' ? record.selector.trim() : '';
                const text =
                    typeof record.text === 'string' ? record.text : '';
                const clear =
                    typeof record.clear === 'boolean' ? record.clear : undefined;

                if (!selector || !text) {
                    return null;
                }

                return {
                    selector,
                    text,
                    ...(clear !== undefined ? { clear } : {}),
                };
            })
            .filter(
                (
                    entry,
                ): entry is {
                    selector: string;
                    text: string;
                    clear?: boolean;
                } => entry !== null,
            );

        if (fields.length === 0) {
            throw new Error('Form fields JSON must include at least one field.');
        }

        return fields;
    }

    function handleCreateChat(): void {
        const draftId = createDraftChatId();
        startTransition(() => {
            setDraftChatId(draftId);
            setSelectedChatId(draftId);
            setMessages([]);
            setLastRun(null);
            setEditingMessageId(null);
            setEditingText('');
            setActionError('');
        });
    }

    function handleSelectChat(chatId: string): void {
        setSelectedChatId(chatId);
        setEditingMessageId(null);
        setEditingText('');
        setActionError('');
    }

    function handleInjectIntoComposer(content: string): void {
        setComposerText((current) =>
            current.trim() ? `${current.trim()}\n\n${content}` : content,
        );
    }

    if (!authReady) {
        return <AuthLoadingScreen />;
    }

    if (authStatus.authRequired && !authStatus.authenticated) {
        return (
            <AuthUnlockScreen
                authBusy={authBusy}
                authStatus={authStatus}
                authTokenInput={authTokenInput}
                dashboardError={dashboardError}
                onAuthTokenInputChange={setAuthTokenInput}
                onLogin={() => {
                    void handleAuthLogin();
                }}
            />
        );
    }

    const availableAgents = status?.agents.filter((agent) => agent.available) ?? [];
    const totalTasks =
        (cronState?.heartbeat ? 1 : 0) +
        (cronState?.cron.length ?? 0) +
        (cronState?.maintenance.length ?? 0);
    const chatList =
        draftChatId && !chats.some((chat) => chat.chatId === draftChatId)
            ? [
                {
                    channel: WEB_CHANNEL,
                    chatId: draftChatId,
                    updatedAt: new Date().toISOString(),
                    messageCount: 0,
                    preview: 'Fresh conversation',
                    role: 'user' as const,
                },
                ...chats,
            ]
            : chats;
    const selectedChat =
        chatList.find((chat) => chat.chatId === selectedChatId) ?? null;
    const queueSummaryByChatId = new Map(
        queueSummaries.map((summary) => [summary.chatId, summary] as const),
    );
    const editedSuccessorById = buildEditedSuccessorMap(messages);
    const selectedChatQueue = queueSummaryByChatId.get(selectedChatId) ?? null;
    const selectedQueueLeadRun = selectedChatQueue?.runs[0] ?? null;
    const currentActiveRun =
        activeRuns.find(
            (entry) =>
                entry.channel === WEB_CHANNEL && entry.chatId === selectedChatId,
        ) ?? null;
    const latestAssistantRoute =
        [...messages]
            .reverse()
            .map((message) => extractAssistantRouteMetadata(message))
            .find((route): route is AssistantRouteMetadata => Boolean(route)) ??
        null;
    const currentRecentEvents = recentEvents.filter((event) => {
        const eventChannel = readPayloadString(event.payload, 'channel');
        const eventChatId = readPayloadString(event.payload, 'chatId');

        return (
            !eventChannel ||
            eventChannel !== WEB_CHANNEL ||
            eventChatId === selectedChatId
        );
    });
    const schedulerTasks = [
        ...(cronState?.heartbeat ? [cronState.heartbeat] : []),
        ...(cronState?.cron ?? []),
        ...(cronState?.maintenance ?? []),
    ];
    const composerShowsSearch = isSearchCommand(deferredComposerText);

    return (
        <main className="app-shell">
            <ShellTopBar
                authBusy={authBusy}
                authRequired={authStatus.authRequired}
                availableAgentCount={availableAgents.length}
                realtimeConnected={realtimeConnected}
                taskCount={totalTasks}
                threadCount={chatList.length}
                tokenId={authStatus.tokenId}
                onLogout={() => {
                    void handleAuthLogout();
                }}
            />

            <div className="workspace-grid">
                <ConversationSidebar
                    availableAgents={availableAgents}
                    chatList={chatList}
                    currentActiveRun={currentActiveRun}
                    latestAssistantRoute={latestAssistantRoute}
                    onCreateChat={handleCreateChat}
                    onPrefixAgent={(agentName) =>
                        setComposerText((current) =>
                            current.startsWith(`@${agentName}`)
                                ? current
                                : `@${agentName} ${current}`.trim(),
                        )
                    }
                    onSelectChat={handleSelectChat}
                    onStartSearch={() => setComposerText('/search ')}
                    queueSummaryByChatId={queueSummaryByChatId}
                    routePreview={routePreview}
                    selectedChat={selectedChat}
                    selectedChatId={selectedChatId}
                    selectedQueueLeadRun={selectedQueueLeadRun}
                    serverHost={status?.server.host}
                />

                <section className="panel conversation-shell">
                    <ConversationHeader
                        currentActiveRun={currentActiveRun}
                        lastRun={lastRun}
                        realtimeConnected={realtimeConnected}
                        selectedChat={selectedChat}
                        selectedChatId={selectedChatId}
                        selectedChatQueue={selectedChatQueue}
                        selectedQueueLeadRun={selectedQueueLeadRun}
                        onCancelRun={(runId) => {
                            void handleCancelRun(runId);
                        }}
                    />

                    {dashboardError ? (
                        <div className="banner banner--danger">{dashboardError}</div>
                    ) : null}
                    {actionError ? (
                        <div className="banner banner--warning">{actionError}</div>
                    ) : null}

                    <ConversationStream
                        currentActiveRun={currentActiveRun}
                        editedSuccessorById={editedSuccessorById}
                        editingMessageId={editingMessageId}
                        editingText={editingText}
                        messages={messages}
                        onEditCancel={() => {
                            setEditingMessageId(null);
                            setEditingText('');
                        }}
                        onEditSave={(messageId) => {
                            void handleEditSave(messageId);
                        }}
                        onEditStart={(messageId, content) => {
                            setEditingMessageId(messageId);
                            setEditingText(content);
                        }}
                        onEditTextChange={setEditingText}
                        onResend={(messageId) => {
                            void handleResend(messageId);
                        }}
                        onRevoke={(messageId) => {
                            void handleRevoke(messageId);
                        }}
                    />

                    <ConversationComposer
                        availableAgents={availableAgents}
                        composerShowsSearch={composerShowsSearch}
                        composerText={composerText}
                        currentActiveRun={currentActiveRun}
                        executionMode={executionMode}
                        lastRun={lastRun}
                        routePreview={routePreview}
                        selectedChatId={selectedChatId}
                        submitting={submitting}
                        onComposerTextChange={setComposerText}
                        onExecutionModeChange={setExecutionMode}
                        onPrefixAgent={(agentName) =>
                            setComposerText((current) =>
                                current.startsWith(`@${agentName}`)
                                    ? current
                                    : `@${agentName} ${current}`.trim(),
                            )
                        }
                        onSend={() => {
                            void handleSend();
                        }}
                        onStartSearch={() => setComposerText('/search ')}
                    />
                </section>

                <InspectorPanel
                    authAdminBusy={authAdminBusy}
                    authSessions={authSessions}
                    authTokenSummaries={authTokenSummaries}
                    browserFormFieldsText={browserFormFieldsText}
                    browserSubmitSelector={browserSubmitSelector}
                    browserTarget={browserTarget}
                    canManageAuth={canManageAuth}
                    currentActiveRun={currentActiveRun}
                    currentRecentEvents={currentRecentEvents}
                    deferredSearchQuery={deferredSearchQuery}
                    handleCreateManagedToken={() => {
                        void handleCreateManagedToken();
                    }}
                    handleCreatePairingInvite={() => {
                        void handleCreatePairingInvite();
                    }}
                    handleInjectIntoComposer={handleInjectIntoComposer}
                    handleRevokeAuthSession={(sessionId) => {
                        void handleRevokeAuthSession(sessionId);
                    }}
                    handleRevokeAuthToken={(tokenId) => {
                        void handleRevokeAuthToken(tokenId);
                    }}
                    handleRevokePairingGrant={(grantId) => {
                        void handleRevokePairingGrant(grantId);
                    }}
                    handleRevokePairingInvite={(inviteId) => {
                        void handleRevokePairingInvite(inviteId);
                    }}
                    handleSelectChat={handleSelectChat}
                    handleTaskRun={(endpoint) => {
                        void handleTaskRun(endpoint);
                    }}
                    hostActionBusy={hostActionBusy}
                    hostActionResult={hostActionResult}
                    inspectorTab={inspectorTab}
                    latestManagedToken={latestManagedToken}
                    managedTokenId={managedTokenId}
                    managedTokenScopes={managedTokenScopes}
                    pairingBusy={pairingBusy}
                    pairingChannel={pairingChannel}
                    pairingInvite={pairingInvite}
                    pairingKind={pairingKind}
                    pairingState={pairingState}
                    parseBrowserFormFields={parseBrowserFormFields}
                    providerHealth={providerHealth}
                    runHostAction={(endpoint, payload) => {
                        void runHostAction(endpoint, payload);
                    }}
                    schedulerTasks={schedulerTasks}
                    screenApp={screenApp}
                    screenInputText={screenInputText}
                    screenSendClear={screenSendClear}
                    screenSendInspectAfter={screenSendInspectAfter}
                    screenSendLaunchIfNeeded={screenSendLaunchIfNeeded}
                    screenSendPressReturn={screenSendPressReturn}
                    screenSendRequireFrontmost={screenSendRequireFrontmost}
                    searchLoading={searchLoading}
                    searchQuery={searchQuery}
                    searchResults={searchResults}
                    searchScope={searchScope}
                    selectedChatId={selectedChatId}
                    selectedChatQueue={selectedChatQueue}
                    setActionError={setActionError}
                    setBrowserFormFieldsText={setBrowserFormFieldsText}
                    setBrowserSubmitSelector={setBrowserSubmitSelector}
                    setBrowserTarget={setBrowserTarget}
                    setInspectorTab={setInspectorTab}
                    setManagedTokenId={setManagedTokenId}
                    setPairingChannel={setPairingChannel}
                    setPairingKind={setPairingKind}
                    setScreenApp={setScreenApp}
                    setScreenInputText={setScreenInputText}
                    setScreenSendClear={setScreenSendClear}
                    setScreenSendInspectAfter={setScreenSendInspectAfter}
                    setScreenSendLaunchIfNeeded={setScreenSendLaunchIfNeeded}
                    setScreenSendPressReturn={setScreenSendPressReturn}
                    setScreenSendRequireFrontmost={
                        setScreenSendRequireFrontmost
                    }
                    setSearchQuery={setSearchQuery}
                    setSearchScope={setSearchScope}
                    status={status}
                    toggleManagedTokenScope={(scope) => {
                        startTransition(() => {
                            setManagedTokenScopes((current) =>
                                current.includes(scope)
                                    ? current.filter((entry) => entry !== scope)
                                    : [...current, scope],
                            );
                        });
                    }}
                    toolLogs={toolLogs}
                />
            </div>
        </main>
    );
}
