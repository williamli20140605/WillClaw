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
import { ShellTopBar } from './ShellTopBar.js';

export interface ShellWorkspaceProps {
    topBar: {
        authBusy: boolean;
        authRequired: boolean;
        availableAgentCount: number;
        handleAuthLogout(): Promise<void>;
        realtimeConnected: boolean;
        taskCount: number;
        threadCount: number;
        tokenId: string | undefined;
    };
    sidebar: {
        availableAgents: AgentAvailability[];
        chatList: ChatSummary[];
        currentActiveRun: ActiveRun | null;
        handleCreateChat(): void;
        handleSelectAgent(agentName: string | null): void;
        handleSelectChat(chatId: string): void;
        handleStartSearch(): void;
        latestAssistantRoute: AssistantRouteMetadata | null;
        queueSummaryByChatId: Map<string, QueueSummary>;
        routePreview: RoutePlan | null;
        selectedAgent: string | null;
        selectedChat: ChatSummary | null;
        selectedChatId: string;
        selectedQueueLeadRun: QueueRunSummary | null;
        serverHost: string | undefined;
    };
    conversation: {
        actionError: string;
        availableAgents: AgentAvailability[];
        composerShowsSearch: boolean;
        composerText: string;
        currentActiveRun: ActiveRun | null;
        dashboardError: string;
        editedSuccessorById: Map<number, StoredMessage>;
        editingMessageId: number | null;
        editingText: string;
        executionMode: 'foreground' | 'background';
        handleAgentChange(agentName: string | null): void;
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
    return (
        <main className="app-shell">
            <ShellTopBar
                authBusy={topBar.authBusy}
                authRequired={topBar.authRequired}
                availableAgentCount={topBar.availableAgentCount}
                realtimeConnected={topBar.realtimeConnected}
                taskCount={topBar.taskCount}
                threadCount={topBar.threadCount}
                tokenId={topBar.tokenId}
                onLogout={() => {
                    void topBar.handleAuthLogout();
                }}
            />

            <div className="workspace-grid">
                <ConversationSidebar
                    availableAgents={sidebar.availableAgents}
                    chatList={sidebar.chatList}
                    currentActiveRun={sidebar.currentActiveRun}
                    latestAssistantRoute={sidebar.latestAssistantRoute}
                    onCreateChat={sidebar.handleCreateChat}
                    onSelectAgent={sidebar.handleSelectAgent}
                    onSelectChat={sidebar.handleSelectChat}
                    onStartSearch={sidebar.handleStartSearch}
                    queueSummaryByChatId={sidebar.queueSummaryByChatId}
                    routePreview={sidebar.routePreview}
                    selectedAgent={sidebar.selectedAgent}
                    selectedChat={sidebar.selectedChat}
                    selectedChatId={sidebar.selectedChatId}
                    selectedQueueLeadRun={sidebar.selectedQueueLeadRun}
                    serverHost={sidebar.serverHost}
                />

                <section className="panel conversation-shell">
                    <ConversationHeader
                        currentActiveRun={conversation.currentActiveRun}
                        lastRun={conversation.lastRun}
                        realtimeConnected={conversation.realtimeConnected}
                        selectedChat={conversation.selectedChat}
                        selectedChatId={conversation.selectedChatId}
                        selectedChatQueue={conversation.selectedChatQueue}
                        selectedQueueLeadRun={conversation.selectedQueueLeadRun}
                        onCancelRun={(runId) => {
                            void conversation.handleCancelRun(runId);
                        }}
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

                    <ConversationComposer
                        availableAgents={conversation.availableAgents}
                        composerShowsSearch={conversation.composerShowsSearch}
                        composerText={conversation.composerText}
                        currentActiveRun={conversation.currentActiveRun}
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
                </section>

                <InspectorPanel
                    activity={inspector.activity}
                    inspectorTab={inspector.inspectorTab}
                    onInspectorTabChange={inspector.setInspectorTab}
                    runtime={inspector.runtime}
                    search={inspector.search}
                />
            </div>
        </main>
    );
}
