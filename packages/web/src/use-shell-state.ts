import { useDeferredValue, useState } from 'react';

import {
    DEFAULT_CHAT,
    type ActiveRun,
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
import type { ShellStateStore } from './shell-state-types.js';

export function useShellState(): ShellStateStore {
    const [authStatus, setAuthStatus] = useState<AuthStatusPayload | null>(null);
    const [authTokenInput, setAuthTokenInput] = useState('');
    const [authBusy, setAuthBusy] = useState(false);
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
    const [status, setStatus] = useState<StatusPayload | null>(null);
    const [cronState, setCronState] = useState<CronPayload | null>(null);
    const [providerHealth, setProviderHealth] = useState<ProviderHealthEntry[]>(
        [],
    );
    const [queueSummaries, setQueueSummaries] = useState<QueueSummary[]>([]);
    const [routePreview, setRoutePreview] = useState<RoutePlan | null>(null);
    const [realtimeConnected, setRealtimeConnected] = useState(false);
    const [activeRuns, setActiveRuns] = useState<ActiveRun[]>([]);
    const [recentEvents, setRecentEvents] = useState<RealtimeEvent[]>([]);
    const [chats, setChats] = useState<ChatSummary[]>([]);
    const [selectedChatId, setSelectedChatId] = useState(DEFAULT_CHAT);
    const [draftChatId, setDraftChatId] = useState<string | null>(null);
    const [messages, setMessages] = useState<StoredMessage[]>([]);
    const [toolLogs, setToolLogs] = useState<ToolLogEntry[]>([]);
    const [composerText, setComposerText] = useState('');
    const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
    const [executionMode, setExecutionMode] = useState<'foreground' | 'background'>(
        'foreground',
    );
    const [submitting, setSubmitting] = useState(false);
    const [lastRun, setLastRun] = useState<ChatResult | null>(null);
    const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
    const [editingText, setEditingText] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchScope, setSearchScope] = useState<SearchScope>('all');
    const [searchResults, setSearchResults] = useState<MemorySearchResult | null>(
        null,
    );
    const [searchLoading, setSearchLoading] = useState(false);
    const [pairingState, setPairingState] = useState<PairingPayload | null>(null);
    const [pairingBusy, setPairingBusy] = useState(false);
    const [pairingKind, setPairingKind] = useState<'web' | 'channel'>('web');
    const [pairingChannel, setPairingChannel] = useState<
        'telegram' | 'discord' | 'feishu'
    >('telegram');
    const [pairingInvite, setPairingInvite] =
        useState<CreatedPairingInvite | null>(null);
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
    const [dashboardError, setDashboardError] = useState('');
    const [actionError, setActionError] = useState('');
    const [inspectorTab, setInspectorTab] = useState<InspectorTab>('search');

    const deferredSearchQuery = useDeferredValue(searchQuery.trim());
    const deferredComposerText = useDeferredValue(composerText.trim());
    const authAllowsDashboard =
        authStatus !== null &&
        (!authStatus.authRequired || authStatus.authenticated);
    const canManageAuth = authStatus?.scopes.includes('api:session') ?? false;

    return {
        auth: {
            adminBusy: authAdminBusy,
            allowsDashboard: authAllowsDashboard,
            busy: authBusy,
            canManageAuth,
            latestManagedToken,
            managedTokenId,
            managedTokenScopes,
            sessions: authSessions,
            status: authStatus,
            tokenInput: authTokenInput,
            tokenSummaries: authTokenSummaries,
        },
        chat: {
            chats,
            composerText,
            draftChatId,
            editingMessageId,
            editingText,
            executionMode,
            lastRun,
            messages,
            selectedAgent,
            selectedChatId,
            submitting,
            toolLogs,
        },
        hostLab: {
            browserFormFieldsText,
            browserSubmitSelector,
            browserTarget,
            hostActionBusy,
            hostActionResult,
            screenApp,
            screenInputText,
            screenSendClear,
            screenSendInspectAfter,
            screenSendLaunchIfNeeded,
            screenSendPressReturn,
            screenSendRequireFrontmost,
        },
        pairing: {
            busy: pairingBusy,
            channel: pairingChannel,
            invite: pairingInvite,
            kind: pairingKind,
            state: pairingState,
        },
        runtime: {
            activeRuns,
            providerHealth,
            queueSummaries,
            realtimeConnected,
            recentEvents,
            routePreview,
            status,
            tasks: cronState,
        },
        search: {
            deferredQuery: deferredSearchQuery,
            loading: searchLoading,
            query: searchQuery,
            results: searchResults,
            scope: searchScope,
        },
        ui: {
            actionError,
            dashboardError,
            deferredComposerText,
            inspectorTab,
        },
        setters: {
            auth: {
                setAdminBusy: setAuthAdminBusy,
                setBusy: setAuthBusy,
                setLatestManagedToken,
                setManagedTokenId,
                setManagedTokenScopes,
                setSessions: setAuthSessions,
                setStatus: setAuthStatus,
                setTokenInput: setAuthTokenInput,
                setTokenSummaries: setAuthTokenSummaries,
            },
            chat: {
                setChats,
                setComposerText,
                setDraftChatId,
                setEditingMessageId,
                setEditingText,
                setExecutionMode,
                setLastRun,
                setMessages,
                setSelectedAgent,
                setSelectedChatId,
                setSubmitting,
                setToolLogs,
            },
            hostLab: {
                setBrowserFormFieldsText,
                setBrowserSubmitSelector,
                setBrowserTarget,
                setHostActionBusy,
                setHostActionResult,
                setScreenApp,
                setScreenInputText,
                setScreenSendClear,
                setScreenSendInspectAfter,
                setScreenSendLaunchIfNeeded,
                setScreenSendPressReturn,
                setScreenSendRequireFrontmost,
            },
            pairing: {
                setBusy: setPairingBusy,
                setChannel: setPairingChannel,
                setInvite: setPairingInvite,
                setKind: setPairingKind,
                setState: setPairingState,
            },
            runtime: {
                setActiveRuns,
                setProviderHealth,
                setQueueSummaries,
                setRealtimeConnected,
                setRecentEvents,
                setRoutePreview,
                setStatus,
                setTasks: setCronState,
            },
            search: {
                setLoading: setSearchLoading,
                setQuery: setSearchQuery,
                setResults: setSearchResults,
                setScope: setSearchScope,
            },
            ui: {
                setActionError,
                setDashboardError,
                setInspectorTab,
            },
        },
    };
}
