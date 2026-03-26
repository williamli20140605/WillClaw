import {
    conversationScopeLabel,
    conversationSubtitle,
    conversationTitle,
    formatRelativeTime,
    routeReasonLabel,
    summarizeText,
} from '../ui-helpers.js';
import type {
    ActiveRun,
    AssistantRouteMetadata,
    ChatSummary,
    QueueRunSummary,
    RoutePlan,
} from '../ui-types.js';

interface ControlDeckProps {
    availableAgentCount: number;
    chatList: ChatSummary[];
    chatUsesAutoRoute: boolean;
    chatUsesDefaultAgent: boolean;
    currentActiveRun: ActiveRun | null;
    defaultAgent: string | null;
    latestAssistantRoute: AssistantRouteMetadata | null;
    realtimeConnected: boolean;
    routePreview: RoutePlan | null;
    selectedAgent: string | null;
    selectedChat: ChatSummary | null;
    selectedChatId: string;
    selectedQueueLeadRun: QueueRunSummary | null;
    taskCount: number;
    trackedThreadCount: number;
    hidden?: boolean;
    onCreateChat(): void;
    onOpenChatMode(): void;
    onSelectChat(chatId: string): void;
    onStartSearch(): void;
}

export function ControlDeck({
    availableAgentCount,
    chatList,
    chatUsesAutoRoute,
    chatUsesDefaultAgent,
    currentActiveRun,
    defaultAgent,
    latestAssistantRoute,
    realtimeConnected,
    routePreview,
    selectedAgent,
    selectedChat,
    selectedChatId,
    selectedQueueLeadRun,
    taskCount,
    trackedThreadCount,
    hidden,
    onCreateChat,
    onOpenChatMode,
    onSelectChat,
    onStartSearch,
}: ControlDeckProps) {
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
        defaultAgent ??
        'auto';
    const routeReason =
        currentActiveRun?.reason ??
        routePreview?.reason ??
        latestAssistantRoute?.reason;
    const threadState = currentActiveRun
        ? currentActiveRun.status === 'queued'
            ? 'queued'
            : 'live run'
        : selectedQueueLeadRun
            ? selectedQueueLeadRun.status === 'running'
                ? 'running'
                : 'queued'
            : 'idle';
    const threadDetail = currentActiveRun
        ? `Started ${formatRelativeTime(currentActiveRun.startedAt)}`
        : selectedQueueLeadRun
            ? selectedQueueLeadRun.status === 'running'
                ? 'A queued run is already executing for this thread.'
                : `${selectedQueueLeadRun.ahead} run(s) ahead in this thread.`
            : 'No active run in this thread yet.';
    const previewText = routePreview?.text.trim()
        ? summarizeText(routePreview.text.trim(), 120)
        : null;

    return (
        <section className="panel control-deck-shell" hidden={hidden}>
            <div className="control-deck-header">
                <div className="control-deck-copy">
                    <div className="eyebrow">Control deck</div>
                    <h2>Shell operations</h2>
                    <p>
                        Keep routing posture, thread focus, and shell shortcuts in
                        the center lane while the right rail stays on runtime
                        details.
                    </p>
                </div>
                <div className="chip-row">
                    <span
                        className="chip"
                        data-tone={realtimeConnected ? 'teal' : 'accent'}
                    >
                        {realtimeConnected ? 'live stream' : 'reconnecting'}
                    </span>
                    <span className="chip">{routeModeLabel}</span>
                    <span className="chip">{routeFocusAgent}</span>
                </div>
            </div>

            <div className="control-deck-body">
                <section className="control-deck-card control-deck-card--metrics">
                    <div className="section-header">
                        <div>
                            <div className="section-kicker">Overview</div>
                            <h3>Gateway posture</h3>
                        </div>
                        <span>{selectedChatId}</span>
                    </div>
                    <div className="control-metric-grid">
                        <article className="control-metric">
                            <span>threads</span>
                            <strong>{trackedThreadCount}</strong>
                            <p>Tracked shell threads available from the rail.</p>
                        </article>
                        <article className="control-metric">
                            <span>tasks</span>
                            <strong>{taskCount}</strong>
                            <p>Scheduled work and live shell operations.</p>
                        </article>
                        <article className="control-metric">
                            <span>agents</span>
                            <strong>{availableAgentCount}</strong>
                            <p>Reachable coding agents ready for routing.</p>
                        </article>
                        <article className="control-metric">
                            <span>route</span>
                            <strong>{routeFocusAgent}</strong>
                            <p>
                                {routeReason
                                    ? routeReasonLabel(routeReason)
                                    : 'Waiting on the next prompt.'}
                            </p>
                        </article>
                    </div>
                </section>

                <div className="control-deck-grid">
                    <section className="control-deck-card">
                        <div className="section-header">
                            <div>
                                <div className="section-kicker">Selected thread</div>
                                <h3>
                                    {conversationTitle(
                                        selectedChat,
                                        selectedChatId,
                                    )}
                                </h3>
                            </div>
                            <span>
                                {conversationScopeLabel(
                                    selectedChat,
                                    selectedChatId,
                                )}
                            </span>
                        </div>
                        <p className="muted">
                            {conversationSubtitle(selectedChat)}
                        </p>
                        <div className="chip-row">
                            <span
                                className="chip"
                                data-tone={
                                    threadState === 'live run'
                                        ? 'teal'
                                        : threadState === 'queued'
                                            ? 'accent'
                                            : undefined
                                }
                            >
                                {threadState}
                            </span>
                            {selectedChat?.updatedAt ? (
                                <span className="chip">
                                    updated{' '}
                                    {formatRelativeTime(selectedChat.updatedAt)}
                                </span>
                            ) : null}
                            {selectedChat?.agent ? (
                                <span className="chip">{selectedChat.agent}</span>
                            ) : null}
                        </div>
                        <p className="muted">{threadDetail}</p>
                        <div className="control-deck-actions">
                            <button
                                className="btn"
                                onClick={onOpenChatMode}
                                type="button"
                            >
                                Open chat lane
                            </button>
                            <button
                                className="ghost-btn"
                                onClick={onCreateChat}
                                type="button"
                            >
                                New thread
                            </button>
                        </div>
                    </section>

                    <section className="control-deck-card">
                        <div className="section-header">
                            <div>
                                <div className="section-kicker">Routing</div>
                                <h3>Route posture</h3>
                            </div>
                            <span>{routeModeLabel}</span>
                        </div>
                        <div className="control-route-focus">
                            <strong>{routeFocusAgent}</strong>
                            <p>
                                {routeReason
                                    ? routeReasonLabel(routeReason)
                                    : 'No route preview yet.'}
                            </p>
                        </div>
                        <div className="chip-row">
                            {routePreview?.explicitAgent ? (
                                <span className="chip" data-tone="accent">
                                    explicit
                                </span>
                            ) : null}
                            {routePreview?.allowFallback === false ? (
                                <span className="chip">no fallback</span>
                            ) : null}
                            {routePreview?.fallbackChain.length ? (
                                <span className="chip">
                                    {routePreview.fallbackChain.length} fallback
                                </span>
                            ) : null}
                            {latestAssistantRoute?.attemptedAgents.length ? (
                                <span className="chip">
                                    {latestAssistantRoute.attemptedAgents.length}{' '}
                                    attempted
                                </span>
                            ) : null}
                        </div>
                        {previewText ? (
                            <div className="control-route-preview">
                                <span>preview prompt</span>
                                <p>{previewText}</p>
                            </div>
                        ) : (
                            <div className="empty">
                                Type in the chat lane to preview routing for the
                                next turn.
                            </div>
                        )}
                        <div className="control-deck-actions">
                            <button
                                className="ghost-btn"
                                onClick={onStartSearch}
                                type="button"
                            >
                                Start search
                            </button>
                        </div>
                    </section>
                </div>

                <section className="control-deck-card">
                    <div className="section-header">
                        <div>
                            <div className="section-kicker">Threads</div>
                            <h3>Recent rail</h3>
                        </div>
                        <span>{chatList.length}</span>
                    </div>
                    {chatList.length === 0 ? (
                        <div className="empty">
                            No tracked threads yet. Create one from the shell rail.
                        </div>
                    ) : (
                        <div className="control-thread-list">
                            {chatList.slice(0, 4).map((chat) => (
                                <button
                                    className="control-thread-card"
                                    data-active={
                                        chat.chatId === selectedChatId
                                            ? 'true'
                                            : undefined
                                    }
                                    key={chat.chatId}
                                    onClick={() => onSelectChat(chat.chatId)}
                                    type="button"
                                >
                                    <div className="control-thread-card__top">
                                        <strong>
                                            {conversationTitle(chat, chat.chatId)}
                                        </strong>
                                        <span>
                                            {formatRelativeTime(chat.updatedAt)}
                                        </span>
                                    </div>
                                    <p>{conversationSubtitle(chat)}</p>
                                </button>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </section>
    );
}
