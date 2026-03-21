import { createDashboardDerivedState } from './dashboard-derived-state.js';
import { createInspectorModels } from './inspector-models.js';
import type {
    ActiveRun,
    AuthSessionSummary,
    AuthTokenSummary,
    CreatedAuthToken,
    CreatedPairingInvite,
    CronPayload,
    MemorySearchResult,
    PairingPayload,
    ProviderHealthEntry,
    QueueSummary,
    RealtimeEvent,
    SearchScope,
    StatusPayload,
    StoredMessage,
    ToolLogEntry,
} from './ui-types.js';

interface CreateShellViewModelsOptions {
    actionError: (message: string) => void;
    activeRuns: ActiveRun[];
    authAdminBusy: boolean;
    authSessions: AuthSessionSummary[];
    authTokenSummaries: AuthTokenSummary[];
    browserFormFieldsText: string;
    browserSubmitSelector: string;
    browserTarget: string;
    canManageAuth: boolean;
    chats: Array<{
        channel: string;
        chatId: string;
        updatedAt: string;
        messageCount: number;
        preview: string;
        role: 'user' | 'assistant' | 'system';
        agent?: string;
        runId?: string;
    }>;
    cronState: CronPayload | null;
    deferredComposerText: string;
    deferredSearchQuery: string;
    draftChatId: string | null;
    handleCreateManagedToken(): Promise<void>;
    handleCreatePairingInvite(): Promise<void>;
    handleInjectIntoComposer(content: string): void;
    handleRevokeAuthSession(sessionId: string): Promise<void>;
    handleRevokeAuthToken(tokenId: string): Promise<void>;
    handleRevokePairingGrant(grantId: string): Promise<void>;
    handleRevokePairingInvite(inviteId: string): Promise<void>;
    handleSelectChat(chatId: string): void;
    handleTaskRun(endpoint: string): Promise<void>;
    hostActionBusy: boolean;
    hostActionResult: string;
    latestManagedToken: CreatedAuthToken | null;
    managedTokenId: string;
    managedTokenScopes: string[];
    messages: StoredMessage[];
    pairingBusy: boolean;
    pairingChannel: 'telegram' | 'discord' | 'feishu';
    pairingInvite: CreatedPairingInvite | null;
    pairingKind: 'web' | 'channel';
    pairingState: PairingPayload | null;
    parseBrowserFormFields(): Array<{
        clear?: boolean;
        selector: string;
        text: string;
    }>;
    providerHealth: ProviderHealthEntry[];
    queueSummaries: QueueSummary[];
    recentEvents: RealtimeEvent[];
    runHostAction(endpoint: string, payload: Record<string, unknown>): Promise<void>;
    screenApp: string;
    screenInputText: string;
    screenSendClear: boolean;
    screenSendInspectAfter: boolean;
    screenSendLaunchIfNeeded: boolean;
    screenSendPressReturn: boolean;
    screenSendRequireFrontmost: boolean;
    searchLoading: boolean;
    searchQuery: string;
    searchResults: MemorySearchResult | null;
    searchScope: SearchScope;
    selectedChatId: string;
    setBrowserFormFieldsText(value: string): void;
    setBrowserSubmitSelector(value: string): void;
    setBrowserTarget(value: string): void;
    setInspectorTab(value: 'search' | 'activity' | 'runtime'): void;
    setManagedTokenId(value: string): void;
    setManagedTokenScopes(value: string[] | ((current: string[]) => string[])): void;
    setPairingChannel(value: 'telegram' | 'discord' | 'feishu'): void;
    setPairingKind(value: 'web' | 'channel'): void;
    setScreenApp(value: string): void;
    setScreenInputText(value: string): void;
    setScreenSendClear(value: boolean): void;
    setScreenSendInspectAfter(value: boolean): void;
    setScreenSendLaunchIfNeeded(value: boolean): void;
    setScreenSendPressReturn(value: boolean): void;
    setScreenSendRequireFrontmost(value: boolean): void;
    setSearchQuery(value: string): void;
    setSearchScope(value: SearchScope): void;
    status: StatusPayload | null;
    toolLogs: ToolLogEntry[];
}

export function createShellViewModels({
    actionError,
    activeRuns,
    authAdminBusy,
    authSessions,
    authTokenSummaries,
    browserFormFieldsText,
    browserSubmitSelector,
    browserTarget,
    canManageAuth,
    chats,
    cronState,
    deferredComposerText,
    deferredSearchQuery,
    draftChatId,
    handleCreateManagedToken,
    handleCreatePairingInvite,
    handleInjectIntoComposer,
    handleRevokeAuthSession,
    handleRevokeAuthToken,
    handleRevokePairingGrant,
    handleRevokePairingInvite,
    handleSelectChat,
    handleTaskRun,
    hostActionBusy,
    hostActionResult,
    latestManagedToken,
    managedTokenId,
    managedTokenScopes,
    messages,
    pairingBusy,
    pairingChannel,
    pairingInvite,
    pairingKind,
    pairingState,
    parseBrowserFormFields,
    providerHealth,
    queueSummaries,
    recentEvents,
    runHostAction,
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
    setBrowserFormFieldsText,
    setBrowserSubmitSelector,
    setBrowserTarget,
    setInspectorTab,
    setManagedTokenId,
    setManagedTokenScopes,
    setPairingChannel,
    setPairingKind,
    setScreenApp,
    setScreenInputText,
    setScreenSendClear,
    setScreenSendInspectAfter,
    setScreenSendLaunchIfNeeded,
    setScreenSendPressReturn,
    setScreenSendRequireFrontmost,
    setSearchQuery,
    setSearchScope,
    status,
    toolLogs,
}: CreateShellViewModelsOptions) {
    const dashboard = createDashboardDerivedState({
        activeRuns,
        chats,
        cronState,
        deferredComposerText,
        draftChatId,
        messages,
        queueSummaries,
        recentEvents,
        selectedChatId,
        status,
    });

    const inspectors = createInspectorModels({
        activityState: {
            currentActiveRun: dashboard.currentActiveRun,
            currentRecentEvents: dashboard.currentRecentEvents,
            selectedChatId,
            toolLogs,
        },
        authState: {
            authAdminBusy,
            authSessions,
            authTokenSummaries,
            canManageAuth,
            latestManagedToken,
            managedTokenId,
            managedTokenScopes,
        },
        hostLabState: {
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
            selectedChatId,
        },
        pairingState: {
            pairingBusy,
            pairingChannel,
            pairingInvite,
            pairingKind,
            pairingState,
        },
        runtimeState: {
            providerHealth,
            schedulerTasks: dashboard.schedulerTasks,
            selectedChatQueue: dashboard.selectedChatQueue,
            status,
        },
        searchState: {
            deferredSearchQuery,
            searchLoading,
            searchQuery,
            searchResults,
            searchScope,
        },
        actions: {
            handleCreateManagedToken,
            handleCreatePairingInvite,
            handleInjectIntoComposer,
            handleRevokeAuthSession,
            handleRevokeAuthToken,
            handleRevokePairingGrant,
            handleRevokePairingInvite,
            handleSelectChat,
            handleTaskRun,
            parseBrowserFormFields,
            runHostAction,
            setActionError: actionError,
            setBrowserFormFieldsText,
            setBrowserSubmitSelector,
            setBrowserTarget,
            setInspectorTab,
            setManagedTokenId,
            setManagedTokenScopes,
            setPairingChannel,
            setPairingKind,
            setScreenApp,
            setScreenInputText,
            setScreenSendClear,
            setScreenSendInspectAfter,
            setScreenSendLaunchIfNeeded,
            setScreenSendPressReturn,
            setScreenSendRequireFrontmost,
            setSearchQuery,
            setSearchScope,
        },
    });

    return {
        ...dashboard,
        ...inspectors,
    };
}
