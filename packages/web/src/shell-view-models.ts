import { createDashboardDerivedState } from './dashboard-derived-state.js';
import { createInspectorModels } from './inspector-models.js';
import type {
    ShellAuthState,
    ShellChatState,
    ShellHostLabState,
    ShellPairingState,
    ShellRuntimeState,
    ShellSearchState,
    ShellSetters,
    ShellUiState,
} from './shell-state-types.js';

type ShellViewAuthState = Pick<
    ShellAuthState,
    | 'adminBusy'
    | 'canManageAuth'
    | 'latestManagedToken'
    | 'managedTokenId'
    | 'managedTokenScopes'
    | 'sessions'
    | 'tokenSummaries'
>;

type ShellViewChatState = Pick<
    ShellChatState,
    'chats' | 'draftChatId' | 'messages' | 'selectedChatId' | 'toolLogs'
>;

type ShellViewHostLabState = ShellHostLabState;
type ShellViewPairingState = ShellPairingState;
type ShellViewRuntimeState = Pick<
    ShellRuntimeState,
    'activeRuns' | 'providerHealth' | 'queueSummaries' | 'recentEvents' | 'status' | 'tasks'
>;
type ShellViewSearchState = ShellSearchState;
type ShellViewUiState = Pick<ShellUiState, 'deferredComposerText'>;

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
        auth: Pick<ShellSetters['auth'], 'setManagedTokenId' | 'setManagedTokenScopes'>;
        hostLab: Pick<
            ShellSetters['hostLab'],
            | 'setBrowserFormFieldsText'
            | 'setBrowserSubmitSelector'
            | 'setBrowserTarget'
            | 'setScreenApp'
            | 'setScreenInputText'
            | 'setScreenSendClear'
            | 'setScreenSendInspectAfter'
            | 'setScreenSendLaunchIfNeeded'
            | 'setScreenSendPressReturn'
            | 'setScreenSendRequireFrontmost'
        >;
        pairing: Pick<ShellSetters['pairing'], 'setChannel' | 'setKind'>;
        search: Pick<ShellSetters['search'], 'setQuery' | 'setScope'>;
        ui: Pick<ShellSetters['ui'], 'setActionError' | 'setInspectorTab'>;
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
