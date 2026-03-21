import { createConversationActions } from './conversation-actions.js';
import { createHostLabActions } from './host-lab-actions.js';
import { createShellAccessActions } from './shell-access-actions.js';
import { createShellLoaders } from './shell-loaders.js';
import { createShellViewModels } from './shell-view-models.js';
import { useShellEffects } from './use-shell-effects.js';
import { useShellState } from './use-shell-state.js';
import type { AuthUnlockScreenProps } from './components/AuthShell.js';
import type { ShellWorkspaceProps } from './components/ShellWorkspace.js';

export type ShellControllerState =
    | { kind: 'loading' }
    | { kind: 'unlock'; props: AuthUnlockScreenProps }
    | { kind: 'workspace'; props: ShellWorkspaceProps };

export function useShellController(): ShellControllerState {
    const {
        auth,
        chat,
        hostLab,
        pairing,
        runtime,
        search,
        setters,
        ui,
    } = useShellState();

    const loaders = createShellLoaders({
        selection: {
            draftChatId: chat.draftChatId,
            searchScope: search.scope,
            selectedChatId: chat.selectedChatId,
        },
        setters,
    });

    useShellEffects({
        auth,
        chat,
        loaders,
        search,
        setters,
        ui,
    });

    const hostLabActions = createHostLabActions({
        browserFormFieldsText: hostLab.browserFormFieldsText,
        loadChatList: loaders.loadChatList,
        loadSchedulerPanel: loaders.loadSchedulerPanel,
        loadToolLogsPanel: loaders.loadToolLogsPanel,
        selectedChatId: chat.selectedChatId,
        setActionError: setters.ui.setActionError,
        setHostActionBusy: setters.hostLab.setHostActionBusy,
        setHostActionResult: setters.hostLab.setHostActionResult,
    });

    const accessActions = createShellAccessActions({
        auth,
        loaders,
        pairing,
        selection: {
            selectedChatId: chat.selectedChatId,
        },
        setters,
    });

    const conversationActions = createConversationActions({
        chat,
        loaders,
        setters,
    });

    if (auth.status === null) {
        return { kind: 'loading' };
    }

    if (auth.status.authRequired && !auth.status.authenticated) {
        return {
            kind: 'unlock',
            props: {
                authBusy: auth.busy,
                authStatus: auth.status,
                authTokenInput: auth.tokenInput,
                dashboardError: ui.dashboardError,
                onAuthTokenInputChange: setters.auth.setTokenInput,
                onLogin: () => {
                    void accessActions.handleAuthLogin();
                },
            },
        };
    }

    const {
        availableAgents,
        activityInspector,
        chatList,
        composerShowsSearch,
        currentActiveRun,
        editedSuccessorById,
        latestAssistantRoute,
        queueSummaryByChatId,
        runtimeInspector,
        searchInspector,
        selectedChat,
        selectedChatQueue,
        selectedQueueLeadRun,
        totalTasks,
    } = createShellViewModels({
        actions: {
            access: accessActions,
            conversation: conversationActions,
            hostLab: hostLabActions,
            setters,
        },
        auth,
        chat,
        hostLab,
        pairing,
        runtime,
        search,
        ui,
    });

    return {
        kind: 'workspace',
        props: {
            topBar: {
                authBusy: auth.busy,
                authRequired: auth.status.authRequired,
                availableAgentCount: availableAgents.length,
                handleAuthLogout: accessActions.handleAuthLogout,
                realtimeConnected: runtime.realtimeConnected,
                taskCount: totalTasks,
                threadCount: chatList.length,
                tokenId: auth.status.tokenId,
            },
            sidebar: {
                availableAgents,
                chatList,
                currentActiveRun,
                handleCreateChat: conversationActions.handleCreateChat,
                handleSelectAgent: conversationActions.handleSelectAgent,
                handleSelectChat: conversationActions.handleSelectChat,
                handleStartSearch: conversationActions.handleStartSearch,
                latestAssistantRoute,
                queueSummaryByChatId,
                routePreview: runtime.routePreview,
                selectedAgent: chat.selectedAgent,
                selectedChat,
                selectedChatId: chat.selectedChatId,
                selectedQueueLeadRun,
                serverHost: runtime.status?.server.host,
            },
            conversation: {
                actionError: ui.actionError,
                availableAgents,
                composerShowsSearch,
                composerText: chat.composerText,
                currentActiveRun,
                dashboardError: ui.dashboardError,
                editedSuccessorById,
                editingMessageId: chat.editingMessageId,
                editingText: chat.editingText,
                executionMode: chat.executionMode,
                handleAgentChange: conversationActions.handleSelectAgent,
                handleCancelRun: conversationActions.handleCancelRun,
                handleEditCancel: conversationActions.handleEditCancel,
                handleEditSave: conversationActions.handleEditSave,
                handleEditStart: conversationActions.handleEditStart,
                handleResend: conversationActions.handleResend,
                handleRevoke: conversationActions.handleRevoke,
                handleSend: conversationActions.handleSend,
                handleStartSearch: conversationActions.handleStartSearch,
                lastRun: chat.lastRun,
                messages: chat.messages,
                realtimeConnected: runtime.realtimeConnected,
                routePreview: runtime.routePreview,
                selectedAgent: chat.selectedAgent,
                selectedChat,
                selectedChatId: chat.selectedChatId,
                selectedChatQueue,
                selectedQueueLeadRun,
                setComposerText: setters.chat.setComposerText,
                setEditingText: setters.chat.setEditingText,
                setExecutionMode: setters.chat.setExecutionMode,
                submitting: chat.submitting,
            },
            inspector: {
                activity: activityInspector,
                inspectorTab: ui.inspectorTab,
                runtime: runtimeInspector,
                search: searchInspector,
                setInspectorTab: setters.ui.setInspectorTab,
            },
        },
    };
}
