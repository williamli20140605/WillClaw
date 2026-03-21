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
import { createConversationActions } from './conversation-actions.js';
import { createHostLabActions } from './host-lab-actions.js';
import { createShellAccessActions } from './shell-access-actions.js';
import { createShellLoaders } from './shell-loaders.js';
import { createShellViewModels } from './shell-view-models.js';
import { useShellEffects } from './use-shell-effects.js';
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
