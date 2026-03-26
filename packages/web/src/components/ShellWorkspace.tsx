import { useState } from 'react';

import type {
    ActivityInspectorModel,
    RuntimeInspectorModel,
    SearchInspectorModel,
} from '../inspector-types.js';
import type {
    ActiveRun,
    AgentAvailability,
    AssistantRouteMetadata,
    ChatResult,
    ChatSummary,
    InspectorTab,
    QueueRunSummary,
    QueueSummary,
    RoutePlan,
    StoredMessage,
} from '../ui-types.js';
import { ConversationComposer } from './ConversationComposer.js';
import { ConversationHeader } from './ConversationHeader.js';
import { ConversationSidebar } from './ConversationSidebar.js';
import { ConversationStream } from './ConversationStream.js';
import { InspectorPanel } from './InspectorPanel.js';
import { ControlDeck } from './ControlDeck.js';
import { ShellTopBar } from './ShellTopBar.js';

export interface ShellWorkspaceProps {
    topBar: {
        authBusy: boolean;
        authRequired: boolean;
        availableAgentCount: number;
        handleAuthLogout(): Promise<void>;
        realtimeConnected: boolean;
        serverAddress: string | undefined;
        taskCount: number;
        threadCount: number;
        tokenId: string | undefined;
    };
    sidebar: {
        availableAgentCount: number;
        availableAgents: AgentAvailability[];
        chatUsesAutoRoute: boolean;
        chatUsesDefaultAgent: boolean;
        chatList: ChatSummary[];
        currentActiveRun: ActiveRun | null;
        defaultAgent: string | null;
        handleCreateChat(): void;
        handleDefaultAgentChange(agentName: string | null): void;
        handleSelectAgent(selection: string): void;
        handleSelectChat(chatId: string): void;
        handleStartSearch(): void;
        latestAssistantRoute: AssistantRouteMetadata | null;
        queueSummaryByChatId: Map<string, QueueSummary>;
        realtimeConnected: boolean;
        routePreview: RoutePlan | null;
        selectedAgent: string | null;
        selectedChat: ChatSummary | null;
        selectedChatId: string;
        selectedQueueLeadRun: QueueRunSummary | null;
        serverHost: string | undefined;
        taskCount: number;
        trackedThreadCount: number;
    };
    conversation: {
        actionError: string;
        availableAgents: AgentAvailability[];
        chatUsesAutoRoute: boolean;
        chatUsesDefaultAgent: boolean;
        composerShowsSearch: boolean;
        composerText: string;
        currentActiveRun: ActiveRun | null;
        dashboardError: string;
        defaultAgent: string | null;
        editedSuccessorById: Map<number, StoredMessage>;
        editingMessageId: number | null;
        editingText: string;
        executionMode: 'foreground' | 'background';
        handleAgentChange(selection: string): void;
        handleCancelRun(runId: string): Promise<void>;
        handleEditCancel(): void;
        handleEditSave(messageId: number): Promise<void>;
        handleEditStart(messageId: number, content: string): void;
        handleResend(messageId: number): Promise<void>;
        handleRevoke(messageId: number): Promise<void>;
        handleSend(): Promise<void>;
        handleStartSearch(): void;
        lastRun: ChatResult | null;
        messages: StoredMessage[];
        realtimeConnected: boolean;
        routePreview: RoutePlan | null;
        selectedAgent: string | null;
        selectedChat: ChatSummary | null;
        selectedChatId: string;
        selectedChatQueue: QueueSummary | null;
        selectedQueueLeadRun: QueueRunSummary | null;
        setComposerText(value: string): void;
        setEditingText(value: string): void;
        setExecutionMode(value: 'foreground' | 'background'): void;
        submitting: boolean;
    };
    inspector: {
        activity: ActivityInspectorModel;
        inspectorTab: InspectorTab;
        runtime: RuntimeInspectorModel;
        search: SearchInspectorModel;
        setInspectorTab(tab: InspectorTab): void;
    };
}

export function ShellWorkspace({
    topBar,
    sidebar,
    conversation,
    inspector,
}: ShellWorkspaceProps) {
    const [workspaceMode, setWorkspaceMode] = useState<'chat' | 'control'>(
        'chat',
    );
    const [mobileNavOpen, setMobileNavOpen] = useState(false);

    function closeMobileNav() {
        setMobileNavOpen(false);
    }

    function handleWorkspaceModeChange(mode: 'chat' | 'control') {
        setWorkspaceMode(mode);
        setMobileNavOpen(false);
        if (mode === 'control') {
            inspector.setInspectorTab('overview');
            return;
        }
        if (inspector.inspectorTab === 'overview') {
            inspector.setInspectorTab('search');
        }
    }

    const composer = (
        <ConversationComposer
            availableAgents={conversation.availableAgents}
            chatUsesAutoRoute={conversation.chatUsesAutoRoute}
            chatUsesDefaultAgent={conversation.chatUsesDefaultAgent}
            composerShowsSearch={conversation.composerShowsSearch}
            composerText={conversation.composerText}
            currentActiveRun={conversation.currentActiveRun}
            defaultAgent={conversation.defaultAgent}
            executionMode={conversation.executionMode}
            lastRun={conversation.lastRun}
            routePreview={conversation.routePreview}
            selectedAgent={conversation.selectedAgent}
            selectedChatId={conversation.selectedChatId}
            submitting={conversation.submitting}
            onAgentChange={conversation.handleAgentChange}
            onComposerTextChange={conversation.setComposerText}
            onExecutionModeChange={conversation.setExecutionMode}
            onSend={() => {
                void conversation.handleSend();
            }}
            onStartSearch={conversation.handleStartSearch}
        />
    );
    const stream = (
        <ConversationStream
            currentActiveRun={conversation.currentActiveRun}
            editedSuccessorById={conversation.editedSuccessorById}
            editingMessageId={conversation.editingMessageId}
            editingText={conversation.editingText}
            messages={conversation.messages}
            onEditCancel={conversation.handleEditCancel}
            onEditSave={(messageId) => {
                void conversation.handleEditSave(messageId);
            }}
            onEditStart={conversation.handleEditStart}
            onEditTextChange={conversation.setEditingText}
            onResend={(messageId) => {
                void conversation.handleResend(messageId);
            }}
            onRevoke={(messageId) => {
                void conversation.handleRevoke(messageId);
            }}
        />
    );

    return (
        <main className="app-shell">
            <ShellTopBar
                authBusy={topBar.authBusy}
                authRequired={topBar.authRequired}
                availableAgentCount={topBar.availableAgentCount}
                realtimeConnected={topBar.realtimeConnected}
                serverAddress={topBar.serverAddress}
                taskCount={topBar.taskCount}
                threadCount={topBar.threadCount}
                tokenId={topBar.tokenId}
                mobileNavOpen={mobileNavOpen}
                workspaceMode={workspaceMode}
                onLogout={() => {
                    void topBar.handleAuthLogout();
                }}
                onShellNavToggle={() => {
                    setMobileNavOpen((current) => !current);
                }}
                onWorkspaceModeChange={handleWorkspaceModeChange}
            />

            <div
                className="workspace-grid"
                data-mobile-sidebar-open={mobileNavOpen ? 'true' : undefined}
                data-mode={workspaceMode}
            >
                <section
                    className="panel conversation-shell"
                    hidden={workspaceMode === 'control'}
                >
                    <ConversationHeader
                        currentActiveRun={conversation.currentActiveRun}
                        chatList={sidebar.chatList}
                        lastRun={conversation.lastRun}
                        realtimeConnected={conversation.realtimeConnected}
                        selectedChat={conversation.selectedChat}
                        selectedChatId={conversation.selectedChatId}
                        selectedChatQueue={conversation.selectedChatQueue}
                        selectedQueueLeadRun={conversation.selectedQueueLeadRun}
                        onCancelRun={(runId) => {
                            void conversation.handleCancelRun(runId);
                        }}
                        onCreateChat={sidebar.handleCreateChat}
                        onSelectChat={sidebar.handleSelectChat}
                    />

                    {conversation.dashboardError ? (
                        <div className="banner banner--danger">
                            {conversation.dashboardError}
                        </div>
                    ) : null}
                    {conversation.actionError ? (
                        <div className="banner banner--warning">
                            {conversation.actionError}
                        </div>
                    ) : null}

                    {conversation.messages.length === 0 ? composer : stream}
                    {conversation.messages.length === 0 ? stream : composer}
                </section>

                <ControlDeck
                    availableAgentCount={sidebar.availableAgentCount}
                    chatList={sidebar.chatList}
                    chatUsesAutoRoute={sidebar.chatUsesAutoRoute}
                    chatUsesDefaultAgent={sidebar.chatUsesDefaultAgent}
                    currentActiveRun={sidebar.currentActiveRun}
                    defaultAgent={sidebar.defaultAgent}
                    hidden={workspaceMode !== 'control'}
                    latestAssistantRoute={sidebar.latestAssistantRoute}
                    realtimeConnected={sidebar.realtimeConnected}
                    routePreview={sidebar.routePreview}
                    selectedAgent={sidebar.selectedAgent}
                    selectedChat={sidebar.selectedChat}
                    selectedChatId={sidebar.selectedChatId}
                    selectedQueueLeadRun={sidebar.selectedQueueLeadRun}
                    taskCount={sidebar.taskCount}
                    trackedThreadCount={sidebar.trackedThreadCount}
                    onCreateChat={() => {
                        sidebar.handleCreateChat();
                        setWorkspaceMode('chat');
                    }}
                    onOpenChatMode={() => handleWorkspaceModeChange('chat')}
                    onSelectChat={(chatId) => {
                        sidebar.handleSelectChat(chatId);
                    }}
                    onStartSearch={() => {
                        sidebar.handleStartSearch();
                        setWorkspaceMode('chat');
                    }}
                />

                <ConversationSidebar
                    availableAgentCount={sidebar.availableAgentCount}
                    availableAgents={sidebar.availableAgents}
                    chatUsesAutoRoute={sidebar.chatUsesAutoRoute}
                    chatUsesDefaultAgent={sidebar.chatUsesDefaultAgent}
                    chatList={sidebar.chatList}
                    currentActiveRun={sidebar.currentActiveRun}
                    defaultAgent={sidebar.defaultAgent}
                    latestAssistantRoute={sidebar.latestAssistantRoute}
                    queueSummaryByChatId={sidebar.queueSummaryByChatId}
                    realtimeConnected={sidebar.realtimeConnected}
                    routePreview={sidebar.routePreview}
                    selectedAgent={sidebar.selectedAgent}
                    selectedChat={sidebar.selectedChat}
                    selectedChatId={sidebar.selectedChatId}
                    selectedQueueLeadRun={sidebar.selectedQueueLeadRun}
                    serverHost={sidebar.serverHost}
                    taskCount={sidebar.taskCount}
                    trackedThreadCount={sidebar.trackedThreadCount}
                    workspaceMode={workspaceMode}
                    onCreateChat={() => {
                        sidebar.handleCreateChat();
                        closeMobileNav();
                    }}
                    onDefaultAgentChange={sidebar.handleDefaultAgentChange}
                    onSelectAgent={sidebar.handleSelectAgent}
                    onSelectChat={(chatId) => {
                        sidebar.handleSelectChat(chatId);
                        closeMobileNav();
                    }}
                    onStartSearch={() => {
                        sidebar.handleStartSearch();
                        closeMobileNav();
                    }}
                />

                <InspectorPanel
                    activity={inspector.activity}
                    inspectorTab={inspector.inspectorTab}
                    onInspectorTabChange={inspector.setInspectorTab}
                    runtime={inspector.runtime}
                    search={inspector.search}
                />
            </div>

            <button
                aria-label="Close shell navigation"
                className="shell-nav-backdrop"
                data-open={mobileNavOpen ? 'true' : undefined}
                hidden={!mobileNavOpen}
                onClick={closeMobileNav}
                type="button"
            />
        </main>
    );
}
