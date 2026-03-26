import { useState } from 'react';

import {
    AUTO_ROUTE_AGENT_SELECTION,
    conversationScopeLabel,
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

type SidebarPane = 'threads' | 'routing' | 'status';

interface ConversationSidebarProps {
    availableAgentCount: number;
    availableAgents: AgentAvailability[];
    chatUsesAutoRoute: boolean;
    chatUsesDefaultAgent: boolean;
    chatList: ChatSummary[];
    currentActiveRun: ActiveRun | null;
    defaultAgent: string | null;
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
    workspaceMode: 'chat' | 'control';
    onCreateChat(): void;
    onDefaultAgentChange(agentName: string | null): void;
    onSelectAgent(selection: string): void;
    onSelectChat(chatId: string): void;
    onStartSearch(): void;
}

export function ConversationSidebar({
    availableAgentCount,
    availableAgents,
    chatUsesAutoRoute,
    chatUsesDefaultAgent,
    chatList,
    currentActiveRun,
    defaultAgent,
    latestAssistantRoute,
    queueSummaryByChatId,
    realtimeConnected,
    routePreview,
    selectedAgent,
    selectedChat,
    selectedChatId,
    selectedQueueLeadRun,
    serverHost,
    taskCount,
    trackedThreadCount,
    workspaceMode,
    onCreateChat,
    onDefaultAgentChange,
    onSelectAgent,
    onSelectChat,
    onStartSearch,
}: ConversationSidebarProps) {
    const [activePane, setActivePane] = useState<SidebarPane>('threads');
    const defaultAgentAvailable = defaultAgent
        ? availableAgents.some((agent) => agent.name === defaultAgent)
        : true;
    const pinnedAgent =
        !chatUsesDefaultAgent && !chatUsesAutoRoute ? selectedAgent : null;
    const routeModeLabel = chatUsesDefaultAgent
        ? `default ${defaultAgent ?? 'auto'}`
        : chatUsesAutoRoute
            ? 'auto route'
            : selectedAgent ?? 'manual';
    const routeFocusAgent =
        currentActiveRun?.agent ??
        selectedAgent ??
        latestAssistantRoute?.selectedAgent ??
        routePreview?.selectedAgent ??
        'auto';
    const threadRunState = currentActiveRun
        ? currentActiveRun.status === 'queued'
            ? 'Queued'
            : 'Running'
        : selectedQueueLeadRun
            ? selectedQueueLeadRun.status === 'running'
                ? 'Running'
                : 'Queued'
            : 'Idle';
    const threadRunDetail = currentActiveRun
        ? currentActiveRun.status === 'queued'
            ? `Waiting ${formatRelativeTime(currentActiveRun.startedAt)}`
            : `Started ${formatRelativeTime(currentActiveRun.startedAt)}`
        : selectedQueueLeadRun
            ? selectedQueueLeadRun.status === 'running'
                ? 'A queued run is already executing for this thread.'
                : `${selectedQueueLeadRun.ahead} run(s) ahead in this thread.`
            : 'No active run in this chat';
    const routeFocusDescription = currentActiveRun?.reason
        ? routeReasonLabel(currentActiveRun.reason)
        : chatUsesDefaultAgent && defaultAgent
            ? 'Using the default agent for this thread.'
            : chatUsesAutoRoute
                ? 'This thread explicitly uses auto routing.'
                : selectedAgent
                    ? 'Pinned manually for this thread.'
                    : latestAssistantRoute?.reason
                        ? routeReasonLabel(latestAssistantRoute.reason)
                        : routePreview
                            ? routeReasonLabel(routePreview.reason)
                            : 'Waiting for the next prompt';

    return (
        <aside className="panel sidebar">
            <div className="sidebar-shell-header">
                <div>
                    <div className="section-kicker">Shell</div>
                    <h2>Control navigation</h2>
                </div>
                <span>{serverHost ?? '127.0.0.1'}</span>
            </div>

            <div className="sidebar-summary-strip">
                <article className="sidebar-summary-card">
                    <span>mode</span>
                    <strong>{workspaceMode}</strong>
                </article>
                <article className="sidebar-summary-card">
                    <span>stream</span>
                    <strong>{realtimeConnected ? 'live' : 'retry'}</strong>
                </article>
                <article className="sidebar-summary-card">
                    <span>agents</span>
                    <strong>{availableAgentCount}</strong>
                </article>
                <article className="sidebar-summary-card">
                    <span>tasks</span>
                    <strong>{taskCount}</strong>
                </article>
            </div>

            <div className="sidebar-shell-nav">
                <button
                    className="sidebar-shell-nav__item"
                    data-active={activePane === 'threads' ? 'true' : undefined}
                    onClick={() => setActivePane('threads')}
                    type="button"
                >
                    Threads
                </button>
                <button
                    className="sidebar-shell-nav__item"
                    data-active={activePane === 'routing' ? 'true' : undefined}
                    onClick={() => setActivePane('routing')}
                    type="button"
                >
                    Routing
                </button>
                <button
                    className="sidebar-shell-nav__item"
                    data-active={activePane === 'status' ? 'true' : undefined}
                    onClick={() => setActivePane('status')}
                    type="button"
                >
                    Status
                </button>
            </div>

            <div
                className="sidebar-pane sidebar-pane--threads"
                hidden={activePane !== 'threads'}
            >
                <div className="sidebar-section">
                    <div className="section-header">
                        <div>
                            <div className="section-kicker">Threads</div>
                            <h2>Thread rail</h2>
                        </div>
                        <span>{trackedThreadCount}</span>
                    </div>
                    <div className="sidebar-actions">
                        <button
                            className="btn btn-block"
                            onClick={onCreateChat}
                            type="button"
                        >
                            New thread
                        </button>
                        <button
                            className="ghost-btn btn-block"
                            onClick={onStartSearch}
                            type="button"
                        >
                            Start search
                        </button>
                    </div>
                </div>

                <div className="sidebar-pane__scroll">
                    <div className="sidebar-section">
                        <div className="section-header">
                            <div>
                                <div className="section-kicker">Tracked</div>
                                <h3>Threads</h3>
                            </div>
                            <span>{trackedThreadCount}</span>
                        </div>
                        {chatList.length === 0 ? (
                            <div className="empty">
                                No web threads yet. Start a new thread and route it
                                through any agent.
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
                                                {chat.isDraft ? (
                                                    <span className="chip" data-tone="accent">
                                                        draft
                                                    </span>
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
                </div>
            </div>

            <div
                className="sidebar-pane sidebar-pane--routing"
                hidden={activePane !== 'routing'}
            >
                <div className="sidebar-section">
                    <div className="section-header">
                        <div>
                            <div className="section-kicker">Routing</div>
                            <h2>Route controls</h2>
                        </div>
                        <span>{routeModeLabel}</span>
                    </div>
                    <div className="quick-grid quick-grid--agents">
                        <button
                            className="quick-btn"
                            data-active={chatUsesAutoRoute ? 'true' : undefined}
                            onClick={() => onSelectAgent(AUTO_ROUTE_AGENT_SELECTION)}
                            type="button"
                        >
                            Auto
                        </button>
                        {availableAgents.slice(0, 2).map((agent) => (
                            <button
                                className="quick-btn"
                                data-active={
                                    pinnedAgent === agent.name ? 'true' : undefined
                                }
                                key={agent.name}
                                onClick={() => onSelectAgent(agent.name)}
                                type="button"
                            >
                                {agent.name}
                            </button>
                        ))}
                    </div>
                    <div className="sidebar-field">
                        <label className="hint" htmlFor="default-agent-select">
                            Routing default
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
                            <option value={AUTO_ROUTE_AGENT_SELECTION}>
                                auto route
                            </option>
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
                </div>

                <div className="sidebar-section">
                    <div className="section-header">
                        <div>
                            <div className="section-kicker">Selection</div>
                            <h3>Current thread</h3>
                        </div>
                        <span>{conversationScopeLabel(selectedChat, selectedChatId)}</span>
                    </div>
                    <div className="sidebar-inline-stats">
                        <article className="sidebar-inline-stat">
                            <span>Run</span>
                            <strong>{threadRunState}</strong>
                        </article>
                        <article className="sidebar-inline-stat">
                            <span>Route</span>
                            <strong>{routeFocusAgent}</strong>
                        </article>
                    </div>
                    <div className="sidebar-footnote">
                        <strong>{conversationTitle(selectedChat, selectedChatId)}</strong>
                        <p>{routeFocusDescription}</p>
                    </div>
                </div>
            </div>

            <div
                className="sidebar-pane sidebar-pane--status"
                hidden={activePane !== 'status'}
            >
                <div className="sidebar-section sidebar-section--gateway">
                    <div className="section-header">
                        <div>
                            <div className="section-kicker">Gateway</div>
                            <h2>Control status</h2>
                        </div>
                        <span>{serverHost ?? '127.0.0.1'}</span>
                    </div>
                    <div className="status-list status-list--grid">
                        <article className="status-row">
                            <span>stream</span>
                            <strong>{realtimeConnected ? 'live' : 'retrying'}</strong>
                        </article>
                        <article className="status-row">
                            <span>agents</span>
                            <strong>{availableAgentCount}</strong>
                        </article>
                        <article className="status-row">
                            <span>threads</span>
                            <strong>{trackedThreadCount}</strong>
                        </article>
                        <article className="status-row">
                            <span>tasks</span>
                            <strong>{taskCount}</strong>
                        </article>
                    </div>
                </div>

                <div className="sidebar-section">
                    <div className="section-header">
                        <div>
                            <div className="section-kicker">Selection</div>
                            <h3>Thread status</h3>
                        </div>
                        <span>{conversationScopeLabel(selectedChat, selectedChatId)}</span>
                    </div>
                    <div className="sidebar-inline-stats">
                        <article className="sidebar-inline-stat">
                            <span>Run</span>
                            <strong>{threadRunState}</strong>
                        </article>
                        <article className="sidebar-inline-stat">
                            <span>Route</span>
                            <strong>{routeFocusAgent}</strong>
                        </article>
                    </div>
                    <div className="sidebar-footnote">
                        <strong>{conversationTitle(selectedChat, selectedChatId)}</strong>
                        <p>{threadRunDetail}</p>
                        <p>{routeFocusDescription}</p>
                    </div>
                </div>
            </div>
        </aside>
    );
}
