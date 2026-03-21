import { useDeferredValue, useState } from 'react';

import { DEFAULT_CHAT, type ActiveRun, type AuthSessionSummary, type AuthStatusPayload, type AuthTokenSummary, type ChatResult, type ChatSummary, type CreatedAuthToken, type CreatedPairingInvite, type CronPayload, type InspectorTab, type MemorySearchResult, type PairingPayload, type ProviderHealthEntry, type QueueSummary, type RealtimeEvent, type RoutePlan, type SearchScope, type StatusPayload, type StoredMessage, type ToolLogEntry } from './ui-types.js';

export function useShellState() {
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
    const [providerHealth, setProviderHealth] = useState<ProviderHealthEntry[]>(
        [],
    );
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

    const deferredSearchQuery = useDeferredValue(searchQuery.trim());
    const deferredComposerText = useDeferredValue(composerText.trim());

    const authReady = authStatus !== null;
    const authAllowsDashboard =
        authReady && (!authStatus.authRequired || authStatus.authenticated);
    const canManageAuth = authStatus?.scopes.includes('api:session') ?? false;

    return {
        actionError,
        activeRuns,
        authAdminBusy,
        authAllowsDashboard,
        authBusy,
        authReady,
        authSessions,
        authStatus,
        authTokenInput,
        authTokenSummaries,
        browserFormFieldsText,
        browserSubmitSelector,
        browserTarget,
        canManageAuth,
        chats,
        composerText,
        cronState,
        dashboardError,
        deferredComposerText,
        deferredSearchQuery,
        draftChatId,
        editingMessageId,
        editingText,
        executionMode,
        hostActionBusy,
        hostActionResult,
        inspectorTab,
        lastRun,
        latestManagedToken,
        managedTokenId,
        managedTokenScopes,
        messages,
        pairingBusy,
        pairingChannel,
        pairingInvite,
        pairingKind,
        pairingState,
        providerHealth,
        queueSummaries,
        realtimeConnected,
        recentEvents,
        routePreview,
        screenApp,
        screenInputText,
        screenSendClear,
        screenSendInspectAfter,
        screenSendLaunchIfNeeded,
        screenSendPressReturn,
        screenSendRequireFrontmost,
        searchLoading,
        searchQuery,
        searchResults,
        searchScope,
        selectedChatId,
        setActionError,
        setActiveRuns,
        setAuthAdminBusy,
        setAuthBusy,
        setAuthSessions,
        setAuthStatus,
        setAuthTokenInput,
        setAuthTokenSummaries,
        setBrowserFormFieldsText,
        setBrowserSubmitSelector,
        setBrowserTarget,
        setChats,
        setComposerText,
        setCronState,
        setDashboardError,
        setDraftChatId,
        setEditingMessageId,
        setEditingText,
        setExecutionMode,
        setHostActionBusy,
        setHostActionResult,
        setInspectorTab,
        setLastRun,
        setLatestManagedToken,
        setManagedTokenId,
        setManagedTokenScopes,
        setMessages,
        setPairingBusy,
        setPairingChannel,
        setPairingInvite,
        setPairingKind,
        setPairingState,
        setProviderHealth,
        setQueueSummaries,
        setRealtimeConnected,
        setRecentEvents,
        setRoutePreview,
        setScreenApp,
        setScreenInputText,
        setScreenSendClear,
        setScreenSendInspectAfter,
        setScreenSendLaunchIfNeeded,
        setScreenSendPressReturn,
        setScreenSendRequireFrontmost,
        setSearchLoading,
        setSearchQuery,
        setSearchResults,
        setSearchScope,
        setSelectedChatId,
        setStatus,
        setSubmitting,
        setToolLogs,
        status,
        submitting,
        toolLogs,
    };
}
