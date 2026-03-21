import type { Dispatch, SetStateAction } from 'react';

import type {
    ActiveRun,
    AuthSessionSummary,
    AuthStatusPayload,
    AuthTokenSummary,
    ChatResult,
    ChatSummary,
    CreatedAuthToken,
    CreatedPairingInvite,
    CronPayload,
    InspectorTab,
    MemorySearchResult,
    PairingPayload,
    ProviderHealthEntry,
    QueueSummary,
    RealtimeEvent,
    RoutePlan,
    SearchScope,
    StatusPayload,
    StoredMessage,
    ToolLogEntry,
} from './ui-types.js';

export interface ShellAuthState {
    adminBusy: boolean;
    allowsDashboard: boolean;
    busy: boolean;
    canManageAuth: boolean;
    latestManagedToken: CreatedAuthToken | null;
    managedTokenId: string;
    managedTokenScopes: string[];
    sessions: AuthSessionSummary[];
    status: AuthStatusPayload | null;
    tokenInput: string;
    tokenSummaries: AuthTokenSummary[];
}

export interface ShellChatState {
    agentSelections: Record<string, string>;
    chatUsesAutoRoute: boolean;
    chatUsesDefaultAgent: boolean;
    chats: ChatSummary[];
    composerText: string;
    defaultAgent: string | null;
    draftChatId: string | null;
    editingMessageId: number | null;
    editingText: string;
    executionMode: 'foreground' | 'background';
    lastRun: ChatResult | null;
    messages: StoredMessage[];
    selectedAgent: string | null;
    selectedChatId: string;
    submitting: boolean;
    toolLogs: ToolLogEntry[];
}

export interface ShellHostLabState {
    browserFormFieldsText: string;
    browserSubmitSelector: string;
    browserTarget: string;
    hostActionBusy: boolean;
    hostActionResult: string;
    screenApp: string;
    screenInputText: string;
    screenSendClear: boolean;
    screenSendInspectAfter: boolean;
    screenSendLaunchIfNeeded: boolean;
    screenSendPressReturn: boolean;
    screenSendRequireFrontmost: boolean;
}

export interface ShellPairingState {
    busy: boolean;
    channel: 'telegram' | 'discord' | 'feishu';
    invite: CreatedPairingInvite | null;
    kind: 'web' | 'channel';
    state: PairingPayload | null;
}

export interface ShellRuntimeState {
    activeRuns: ActiveRun[];
    providerHealth: ProviderHealthEntry[];
    queueSummaries: QueueSummary[];
    realtimeConnected: boolean;
    recentEvents: RealtimeEvent[];
    routePreview: RoutePlan | null;
    status: StatusPayload | null;
    tasks: CronPayload | null;
}

export interface ShellSearchState {
    deferredQuery: string;
    loading: boolean;
    query: string;
    results: MemorySearchResult | null;
    scope: SearchScope;
}

export interface ShellUiState {
    actionError: string;
    dashboardError: string;
    deferredComposerText: string;
    inspectorTab: InspectorTab;
}

export interface ShellAuthSetters {
    setAdminBusy: Dispatch<SetStateAction<boolean>>;
    setBusy: Dispatch<SetStateAction<boolean>>;
    setLatestManagedToken: Dispatch<SetStateAction<CreatedAuthToken | null>>;
    setManagedTokenId: Dispatch<SetStateAction<string>>;
    setManagedTokenScopes: Dispatch<SetStateAction<string[]>>;
    setSessions: Dispatch<SetStateAction<AuthSessionSummary[]>>;
    setStatus: Dispatch<SetStateAction<AuthStatusPayload | null>>;
    setTokenInput: Dispatch<SetStateAction<string>>;
    setTokenSummaries: Dispatch<SetStateAction<AuthTokenSummary[]>>;
}

export interface ShellChatSetters {
    setAgentSelections: Dispatch<SetStateAction<Record<string, string>>>;
    setChats: Dispatch<SetStateAction<ChatSummary[]>>;
    setComposerText: Dispatch<SetStateAction<string>>;
    setDefaultAgent: Dispatch<SetStateAction<string | null>>;
    setDraftChatId: Dispatch<SetStateAction<string | null>>;
    setEditingMessageId: Dispatch<SetStateAction<number | null>>;
    setEditingText: Dispatch<SetStateAction<string>>;
    setExecutionMode: Dispatch<SetStateAction<'foreground' | 'background'>>;
    setLastRun: Dispatch<SetStateAction<ChatResult | null>>;
    setMessages: Dispatch<SetStateAction<StoredMessage[]>>;
    setSelectedChatId: Dispatch<SetStateAction<string>>;
    setSubmitting: Dispatch<SetStateAction<boolean>>;
    setToolLogs: Dispatch<SetStateAction<ToolLogEntry[]>>;
}

export interface ShellHostLabSetters {
    setBrowserFormFieldsText: Dispatch<SetStateAction<string>>;
    setBrowserSubmitSelector: Dispatch<SetStateAction<string>>;
    setBrowserTarget: Dispatch<SetStateAction<string>>;
    setHostActionBusy: Dispatch<SetStateAction<boolean>>;
    setHostActionResult: Dispatch<SetStateAction<string>>;
    setScreenApp: Dispatch<SetStateAction<string>>;
    setScreenInputText: Dispatch<SetStateAction<string>>;
    setScreenSendClear: Dispatch<SetStateAction<boolean>>;
    setScreenSendInspectAfter: Dispatch<SetStateAction<boolean>>;
    setScreenSendLaunchIfNeeded: Dispatch<SetStateAction<boolean>>;
    setScreenSendPressReturn: Dispatch<SetStateAction<boolean>>;
    setScreenSendRequireFrontmost: Dispatch<SetStateAction<boolean>>;
}

export interface ShellPairingSetters {
    setBusy: Dispatch<SetStateAction<boolean>>;
    setChannel: Dispatch<SetStateAction<'telegram' | 'discord' | 'feishu'>>;
    setInvite: Dispatch<SetStateAction<CreatedPairingInvite | null>>;
    setKind: Dispatch<SetStateAction<'web' | 'channel'>>;
    setState: Dispatch<SetStateAction<PairingPayload | null>>;
}

export interface ShellRuntimeSetters {
    setActiveRuns: Dispatch<SetStateAction<ActiveRun[]>>;
    setProviderHealth: Dispatch<SetStateAction<ProviderHealthEntry[]>>;
    setQueueSummaries: Dispatch<SetStateAction<QueueSummary[]>>;
    setRealtimeConnected: Dispatch<SetStateAction<boolean>>;
    setRecentEvents: Dispatch<SetStateAction<RealtimeEvent[]>>;
    setRoutePreview: Dispatch<SetStateAction<RoutePlan | null>>;
    setStatus: Dispatch<SetStateAction<StatusPayload | null>>;
    setTasks: Dispatch<SetStateAction<CronPayload | null>>;
}

export interface ShellSearchSetters {
    setLoading: Dispatch<SetStateAction<boolean>>;
    setQuery: Dispatch<SetStateAction<string>>;
    setResults: Dispatch<SetStateAction<MemorySearchResult | null>>;
    setScope: Dispatch<SetStateAction<SearchScope>>;
}

export interface ShellUiSetters {
    setActionError: Dispatch<SetStateAction<string>>;
    setDashboardError: Dispatch<SetStateAction<string>>;
    setInspectorTab: Dispatch<SetStateAction<InspectorTab>>;
}

export interface ShellSetters {
    auth: ShellAuthSetters;
    chat: ShellChatSetters;
    hostLab: ShellHostLabSetters;
    pairing: ShellPairingSetters;
    runtime: ShellRuntimeSetters;
    search: ShellSearchSetters;
    ui: ShellUiSetters;
}

export interface ShellStateStore {
    auth: ShellAuthState;
    chat: ShellChatState;
    hostLab: ShellHostLabState;
    pairing: ShellPairingState;
    runtime: ShellRuntimeState;
    search: ShellSearchState;
    ui: ShellUiState;
    setters: ShellSetters;
}
