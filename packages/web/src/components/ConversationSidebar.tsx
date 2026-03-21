import {
    AUTO_ROUTE_AGENT_SELECTION,
    conversationSubtitle,
    conversationTitle,
    formatRelativeTime,
    routeReasonLabel,
} from '../ui-helpers.js';
import type {
    ActiveRun,
    AgentAvailability,
    AssistantRouteMetadata,
    ChatSummary,
    QueueRunSummary,
    QueueSummary,
    RoutePlan,
} from '../ui-types.js';

interface ConversationSidebarProps {
    availableAgents: AgentAvailability[];
    chatUsesAutoRoute: boolean;
    chatUsesDefaultAgent: boolean;
    chatList: ChatSummary[];
    currentActiveRun: ActiveRun | null;
    defaultAgent: string | null;
    latestAssistantRoute: AssistantRouteMetadata | null;
    queueSummaryByChatId: Map<string, QueueSummary>;
    routePreview: RoutePlan | null;
    selectedAgent: string | null;
    selectedChat: ChatSummary | null;
    selectedChatId: string;
    selectedQueueLeadRun: QueueRunSummary | null;
    serverHost: string | undefined;
    onCreateChat(): void;
    onDefaultAgentChange(agentName: string | null): void;
    onSelectAgent(selection: string): void;
    onSelectChat(chatId: string): void;
    onStartSearch(): void;
}

export function ConversationSidebar({
    availableAgents,
    chatUsesAutoRoute,
    chatUsesDefaultAgent,
    chatList,
    currentActiveRun,
    defaultAgent,
    latestAssistantRoute,
    queueSummaryByChatId,
    routePreview,
    selectedAgent,
    selectedChat,
    selectedChatId,
    selectedQueueLeadRun,
    serverHost,
    onCreateChat,
    onDefaultAgentChange,
    onSelectAgent,
    onSelectChat,
    onStartSearch,
}: ConversationSidebarProps) {
    const defaultAgentAvailable = defaultAgent
        ? availableAgents.some((agent) => agent.name === defaultAgent)
        : true;

    return (
        <aside className="panel sidebar">
            <div className="sidebar-section">
                <div className="section-header">
                    <h2>Conversations</h2>
                    <span>{chatList.length} tracked</span>
                </div>
                <button className="btn btn-block" onClick={onCreateChat} type="button">
                    New conversation
                </button>
                <div className="quick-grid">
                    <button
                        className="quick-btn"
                        onClick={onStartSearch}
                        type="button"
                    >
                        Start search
                    </button>
                    <button
                        className="quick-btn"
                        onClick={() => onSelectAgent(AUTO_ROUTE_AGENT_SELECTION)}
                        type="button"
                    >
                        Auto
                    </button>
                    {availableAgents.slice(0, 2).map((agent) => (
                        <button
                            className="quick-btn"
                            key={agent.name}
                            onClick={() => onSelectAgent(agent.name)}
                            type="button"
                        >
                            {agent.name}
                        </button>
                    ))}
                </div>
                <label className="hint" htmlFor="default-agent-select">
                    Default agent
                </label>
                <select
                    id="default-agent-select"
                    value={defaultAgent ?? AUTO_ROUTE_AGENT_SELECTION}
                    onChange={(event) =>
                        onDefaultAgentChange(
                            event.target.value === AUTO_ROUTE_AGENT_SELECTION
                                ? null
                                : event.target.value,
                        )
                    }
                >
                    <option value={AUTO_ROUTE_AGENT_SELECTION}>auto route</option>
                    {!defaultAgentAvailable && defaultAgent ? (
                        <option value={defaultAgent}>
                            {defaultAgent} (default)
                        </option>
                    ) : null}
                    {availableAgents.map((agent) => (
                        <option key={agent.name} value={agent.name}>
                            {agent.name}
                        </option>
                    ))}
                </select>
            </div>

            <div className="sidebar-section sidebar-section--scroll">
                {chatList.length === 0 ? (
                    <div className="empty">
                        No web conversations yet. Start a new thread and route
                        it through any agent.
                    </div>
                ) : (
                    <div className="session-list">
                        {chatList.map((chat) => {
                            const chatQueue = queueSummaryByChatId.get(chat.chatId);

                            return (
                                <button
                                    className="session-card"
                                    data-active={chat.chatId === selectedChatId}
                                    key={chat.chatId}
                                    onClick={() => onSelectChat(chat.chatId)}
                                    type="button"
                                >
                                    <div className="session-card__header">
                                        <strong>
                                            {conversationTitle(chat, chat.chatId)}
                                        </strong>
                                        <span>{formatRelativeTime(chat.updatedAt)}</span>
                                    </div>
                                    <p>{conversationSubtitle(chat)}</p>
                                    <div className="chip-row">
                                        <span className="chip">
                                            {chat.messageCount} msgs
                                        </span>
                                        <span
                                            className="chip"
                                            data-tone={
                                                chat.role === 'assistant'
                                                    ? 'teal'
                                                    : chat.role === 'system'
                                                        ? 'accent'
                                                        : undefined
                                            }
                                        >
                                            {chat.role}
                                        </span>
                                        {chat.agent ? (
                                            <span className="chip">{chat.agent}</span>
                                        ) : null}
                                        {chatQueue?.queued ? (
                                            <span className="chip" data-tone="accent">
                                                {chatQueue.queued} queued
                                            </span>
                                        ) : null}
                                        {chatQueue?.running ? (
                                            <span className="chip" data-tone="teal">
                                                {chatQueue.running} running
                                            </span>
                                        ) : null}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="sidebar-section">
                <div className="section-header">
                    <h3>Shell View</h3>
                    <span>{serverHost ?? '127.0.0.1'}</span>
                </div>
                <div className="metric-grid">
                    <article className="metric-card">
                        <label>Selected</label>
                        <strong>{selectedChatId.slice(0, 12)}</strong>
                        <p>{conversationTitle(selectedChat, selectedChatId)}</p>
                    </article>
                    <article className="metric-card">
                        <label>Run state</label>
                        <strong>
                            {currentActiveRun
                                ? currentActiveRun.status === 'queued'
                                    ? 'Queued'
                                    : 'Running'
                                : selectedQueueLeadRun
                                    ? selectedQueueLeadRun.status === 'running'
                                        ? 'Running'
                                        : 'Queued'
                                    : 'Idle'}
                        </strong>
                        <p>
                            {currentActiveRun
                                ? currentActiveRun.status === 'queued'
                                    ? `Waiting ${formatRelativeTime(currentActiveRun.startedAt)}`
                                    : `Started ${formatRelativeTime(currentActiveRun.startedAt)}`
                                : selectedQueueLeadRun
                                    ? selectedQueueLeadRun.status === 'running'
                                        ? 'A queued run is already executing for this thread.'
                                        : `${selectedQueueLeadRun.ahead} run(s) ahead in this thread.`
                                    : 'No active run in this chat'}
                        </p>
                    </article>
                    <article className="metric-card">
                        <label>Routing</label>
                        <strong>
                            {currentActiveRun?.agent ??
                                selectedAgent ??
                                latestAssistantRoute?.selectedAgent ??
                                routePreview?.selectedAgent ??
                                'auto'}
                        </strong>
                        <p>
                            {currentActiveRun?.reason
                                ? routeReasonLabel(currentActiveRun.reason)
                                : chatUsesDefaultAgent && defaultAgent
                                    ? 'Using the default agent for this chat.'
                                : chatUsesAutoRoute
                                    ? 'This chat explicitly uses auto routing.'
                                : selectedAgent
                                    ? 'Manually selected for this chat.'
                                : latestAssistantRoute?.reason
                                    ? routeReasonLabel(latestAssistantRoute.reason)
                                    : routePreview
                                        ? routeReasonLabel(routePreview.reason)
                                        : 'Waiting for next prompt'}
                        </p>
                    </article>
                </div>
            </div>
        </aside>
    );
}
