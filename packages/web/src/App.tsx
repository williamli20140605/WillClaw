import { createConversationActions } from './conversation-actions.js';
import { createHostLabActions } from './host-lab-actions.js';
import { createShellAccessActions } from './shell-access-actions.js';
import { createShellLoaders } from './shell-loaders.js';
import { createShellViewModels } from './shell-view-models.js';
import { useShellEffects } from './use-shell-effects.js';
import { useShellState } from './use-shell-state.js';
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
    const {
        actionError,
        activeRuns,
        authAdminBusy,
        authAllowsDashboard,
        authBusy,
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
    } = useShellState();
    const {
        loadAuthAdminPanel,
        loadAuthStatus,
        loadChatList,
        loadMessagesPanel,
        loadPairingPanel,
        loadQueuePanel,
        loadRoutePreview,
        loadSchedulerPanel,
        loadSearch,
        loadShellPanels,
        loadToolLogsPanel,
    } = createShellLoaders({
        draftChatId,
        searchScope,
        selectedChatId,
        setActionError,
        setAuthSessions,
        setAuthStatus,
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
    });

    useShellEffects({
        authAllowsDashboard,
        deferredComposerText,
        deferredSearchQuery,
        draftChatId,
        loadAuthStatus,
        loadChatList,
        loadMessagesPanel,
        loadQueuePanel,
        loadRoutePreview,
        loadSchedulerPanel,
        loadSearch,
        loadShellPanels,
        loadToolLogsPanel,
        searchScope,
        selectedChatId,
        setActiveRuns,
        setDashboardError,
        setRealtimeConnected,
        setRecentEvents,
    });

    const { handleTaskRun, parseBrowserFormFields, runHostAction } =
        createHostLabActions({
            browserFormFieldsText,
            loadChatList,
            loadSchedulerPanel,
            loadToolLogsPanel,
            selectedChatId,
            setActionError,
            setHostActionBusy,
            setHostActionResult,
        });
    const {
        handleAuthLogin,
        handleAuthLogout,
        handleCreateManagedToken,
        handleCreatePairingInvite,
        handleRevokeAuthSession,
        handleRevokeAuthToken,
        handleRevokePairingGrant,
        handleRevokePairingInvite,
    } = createShellAccessActions({
        authTokenInput,
        loadAuthAdminPanel,
        loadMessagesPanel,
        loadPairingPanel,
        loadShellPanels,
        loadToolLogsPanel,
        managedTokenId,
        managedTokenScopes,
        pairingChannel,
        pairingInvite,
        pairingKind,
        selectedChatId,
        setActionError,
        setActiveRuns,
        setAuthAdminBusy,
        setAuthBusy,
        setAuthStatus,
        setAuthTokenInput,
        setDashboardError,
        setLatestManagedToken,
        setManagedTokenId,
        setMessages,
        setPairingBusy,
        setPairingInvite,
        setRealtimeConnected,
        setRecentEvents,
        setToolLogs,
    });
    const {
        handleCancelRun,
        handleCreateChat,
        handleEditCancel,
        handleEditSave,
        handleEditStart,
        handleInjectIntoComposer,
        handlePrefixAgent,
        handleResend,
        handleRevoke,
        handleSelectChat,
        handleSend,
        handleStartSearch,
    } = createConversationActions({
        composerText,
        editingText,
        executionMode,
        loadChatList,
        loadMessagesPanel,
        loadToolLogsPanel,
        selectedChatId,
        setActionError,
        setComposerText,
        setDraftChatId,
        setEditingMessageId,
        setEditingText,
        setLastRun,
        setMessages,
        setSelectedChatId,
        setSubmitting,
    });

    if (authStatus === null) {
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
        actionError: setActionError,
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
    });

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
                    onPrefixAgent={handlePrefixAgent}
                    onSelectChat={handleSelectChat}
                    onStartSearch={handleStartSearch}
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
                        onEditCancel={handleEditCancel}
                        onEditSave={(messageId) => {
                            void handleEditSave(messageId);
                        }}
                        onEditStart={handleEditStart}
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
                        onPrefixAgent={handlePrefixAgent}
                        onSend={() => {
                            void handleSend();
                        }}
                        onStartSearch={handleStartSearch}
                    />
                </section>

                <InspectorPanel
                    activity={activityInspector}
                    inspectorTab={inspectorTab}
                    onInspectorTabChange={setInspectorTab}
                    runtime={runtimeInspector}
                    search={searchInspector}
                />
            </div>
        </main>
    );
}
