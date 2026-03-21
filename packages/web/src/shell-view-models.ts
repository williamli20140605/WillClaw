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

interface ShellViewAuthState {
    adminBusy: boolean;
    canManageAuth: boolean;
    latestManagedToken: CreatedAuthToken | null;
    managedTokenId: string;
    managedTokenScopes: string[];
    sessions: AuthSessionSummary[];
    tokenSummaries: AuthTokenSummary[];
}

interface ShellViewChatState {
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
    draftChatId: string | null;
    messages: StoredMessage[];
    selectedChatId: string;
    toolLogs: ToolLogEntry[];
}

interface ShellViewHostLabState {
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

interface ShellViewPairingState {
    busy: boolean;
    channel: 'telegram' | 'discord' | 'feishu';
    invite: CreatedPairingInvite | null;
    kind: 'web' | 'channel';
    state: PairingPayload | null;
}

interface ShellViewRuntimeState {
    activeRuns: ActiveRun[];
    providerHealth: ProviderHealthEntry[];
    queueSummaries: QueueSummary[];
    recentEvents: RealtimeEvent[];
    status: StatusPayload | null;
    tasks: CronPayload | null;
}

interface ShellViewSearchState {
    deferredQuery: string;
    loading: boolean;
    query: string;
    results: MemorySearchResult | null;
    scope: SearchScope;
}

interface ShellViewUiState {
    deferredComposerText: string;
}

interface ShellViewActions {
    access: {
        handleCreateManagedToken(): Promise<void>;
        handleCreatePairingInvite(): Promise<void>;
        handleRevokeAuthSession(sessionId: string): Promise<void>;
        handleRevokeAuthToken(tokenId: string): Promise<void>;
        handleRevokePairingGrant(grantId: string): Promise<void>;
        handleRevokePairingInvite(inviteId: string): Promise<void>;
    };
    conversation: {
        handleInjectIntoComposer(content: string): void;
        handleSelectChat(chatId: string): void;
    };
    hostLab: {
        handleTaskRun(endpoint: string): Promise<void>;
        parseBrowserFormFields(): Array<{
            clear?: boolean;
            selector: string;
            text: string;
        }>;
        runHostAction(
            endpoint: string,
            payload: Record<string, unknown>,
        ): Promise<void>;
    };
    setters: {
        auth: {
            setManagedTokenId(value: string): void;
            setManagedTokenScopes(
                value: string[] | ((current: string[]) => string[]),
            ): void;
        };
        hostLab: {
            setBrowserFormFieldsText(value: string): void;
            setBrowserSubmitSelector(value: string): void;
            setBrowserTarget(value: string): void;
            setScreenApp(value: string): void;
            setScreenInputText(value: string): void;
            setScreenSendClear(value: boolean): void;
            setScreenSendInspectAfter(value: boolean): void;
            setScreenSendLaunchIfNeeded(value: boolean): void;
            setScreenSendPressReturn(value: boolean): void;
            setScreenSendRequireFrontmost(value: boolean): void;
        };
        pairing: {
            setChannel(value: 'telegram' | 'discord' | 'feishu'): void;
            setKind(value: 'web' | 'channel'): void;
        };
        search: {
            setQuery(value: string): void;
            setScope(value: SearchScope): void;
        };
        ui: {
            setActionError(message: string): void;
            setInspectorTab(value: 'search' | 'activity' | 'runtime'): void;
        };
    };
}

interface CreateShellViewModelsOptions {
    actions: ShellViewActions;
    auth: ShellViewAuthState;
    chat: ShellViewChatState;
    hostLab: ShellViewHostLabState;
    pairing: ShellViewPairingState;
    runtime: ShellViewRuntimeState;
    search: ShellViewSearchState;
    ui: ShellViewUiState;
}

export function createShellViewModels({
    actions,
    auth,
    chat,
    hostLab,
    pairing,
    runtime,
    search,
    ui,
}: CreateShellViewModelsOptions) {
    const dashboard = createDashboardDerivedState({
        activeRuns: runtime.activeRuns,
        chats: chat.chats,
        cronState: runtime.tasks,
        deferredComposerText: ui.deferredComposerText,
        draftChatId: chat.draftChatId,
        messages: chat.messages,
        queueSummaries: runtime.queueSummaries,
        recentEvents: runtime.recentEvents,
        selectedChatId: chat.selectedChatId,
        status: runtime.status,
    });

    const inspectors = createInspectorModels({
        activityState: {
            currentActiveRun: dashboard.currentActiveRun,
            currentRecentEvents: dashboard.currentRecentEvents,
            selectedChatId: chat.selectedChatId,
            toolLogs: chat.toolLogs,
        },
        authState: {
            authAdminBusy: auth.adminBusy,
            authSessions: auth.sessions,
            authTokenSummaries: auth.tokenSummaries,
            canManageAuth: auth.canManageAuth,
            latestManagedToken: auth.latestManagedToken,
            managedTokenId: auth.managedTokenId,
            managedTokenScopes: auth.managedTokenScopes,
        },
        hostLabState: {
            ...hostLab,
            selectedChatId: chat.selectedChatId,
        },
        pairingState: {
            pairingBusy: pairing.busy,
            pairingChannel: pairing.channel,
            pairingInvite: pairing.invite,
            pairingKind: pairing.kind,
            pairingState: pairing.state,
        },
        runtimeState: {
            providerHealth: runtime.providerHealth,
            schedulerTasks: dashboard.schedulerTasks,
            selectedChatQueue: dashboard.selectedChatQueue,
            status: runtime.status,
        },
        searchState: {
            deferredSearchQuery: search.deferredQuery,
            searchLoading: search.loading,
            searchQuery: search.query,
            searchResults: search.results,
            searchScope: search.scope,
        },
        actions: {
            handleCreateManagedToken: actions.access.handleCreateManagedToken,
            handleCreatePairingInvite: actions.access.handleCreatePairingInvite,
            handleInjectIntoComposer:
                actions.conversation.handleInjectIntoComposer,
            handleRevokeAuthSession: actions.access.handleRevokeAuthSession,
            handleRevokeAuthToken: actions.access.handleRevokeAuthToken,
            handleRevokePairingGrant: actions.access.handleRevokePairingGrant,
            handleRevokePairingInvite: actions.access.handleRevokePairingInvite,
            handleSelectChat: actions.conversation.handleSelectChat,
            handleTaskRun: actions.hostLab.handleTaskRun,
            parseBrowserFormFields: actions.hostLab.parseBrowserFormFields,
            runHostAction: actions.hostLab.runHostAction,
            setActionError: actions.setters.ui.setActionError,
            setBrowserFormFieldsText:
                actions.setters.hostLab.setBrowserFormFieldsText,
            setBrowserSubmitSelector:
                actions.setters.hostLab.setBrowserSubmitSelector,
            setBrowserTarget: actions.setters.hostLab.setBrowserTarget,
            setInspectorTab: actions.setters.ui.setInspectorTab,
            setManagedTokenId: actions.setters.auth.setManagedTokenId,
            setManagedTokenScopes: actions.setters.auth.setManagedTokenScopes,
            setPairingChannel: actions.setters.pairing.setChannel,
            setPairingKind: actions.setters.pairing.setKind,
            setScreenApp: actions.setters.hostLab.setScreenApp,
            setScreenInputText: actions.setters.hostLab.setScreenInputText,
            setScreenSendClear: actions.setters.hostLab.setScreenSendClear,
            setScreenSendInspectAfter:
                actions.setters.hostLab.setScreenSendInspectAfter,
            setScreenSendLaunchIfNeeded:
                actions.setters.hostLab.setScreenSendLaunchIfNeeded,
            setScreenSendPressReturn:
                actions.setters.hostLab.setScreenSendPressReturn,
            setScreenSendRequireFrontmost:
                actions.setters.hostLab.setScreenSendRequireFrontmost,
            setSearchQuery: actions.setters.search.setQuery,
            setSearchScope: actions.setters.search.setScope,
        },
    });

    return {
        ...dashboard,
        ...inspectors,
    };
}
