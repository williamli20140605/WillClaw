import {
    AUTO_ROUTE_AGENT_SELECTION,
    INHERIT_DEFAULT_AGENT_SELECTION,
    formatDuration,
    formatRelativeTime,
    routeReasonLabel,
} from '../ui-helpers.js';
import type {
    ActiveRun,
    AgentAvailability,
    ChatResult,
    RoutePlan,
} from '../ui-types.js';

interface ConversationComposerProps {
    availableAgents: AgentAvailability[];
    chatUsesAutoRoute: boolean;
    chatUsesDefaultAgent: boolean;
    composerShowsSearch: boolean;
    composerText: string;
    currentActiveRun: ActiveRun | null;
    defaultAgent: string | null;
    executionMode: 'foreground' | 'background';
    lastRun: ChatResult | null;
    routePreview: RoutePlan | null;
    selectedAgent: string | null;
    selectedChatId: string;
    submitting: boolean;
    onAgentChange(value: string): void;
    onComposerTextChange(value: string): void;
    onExecutionModeChange(value: 'foreground' | 'background'): void;
    onSend(): void;
    onStartSearch(): void;
}

export function ConversationComposer({
    availableAgents,
    chatUsesAutoRoute,
    chatUsesDefaultAgent,
    composerShowsSearch,
    composerText,
    currentActiveRun,
    defaultAgent,
    executionMode,
    lastRun,
    routePreview,
    selectedAgent,
    selectedChatId,
    submitting,
    onAgentChange,
    onComposerTextChange,
    onExecutionModeChange,
    onSend,
    onStartSearch,
}: ConversationComposerProps) {
    const explicitSelectedAgent =
        !chatUsesDefaultAgent && !chatUsesAutoRoute ? selectedAgent : null;
    const canSend = composerText.trim().length > 0 && !submitting;
    const agentPickerValue = chatUsesDefaultAgent
        ? INHERIT_DEFAULT_AGENT_SELECTION
        : chatUsesAutoRoute
            ? AUTO_ROUTE_AGENT_SELECTION
            : selectedAgent ?? INHERIT_DEFAULT_AGENT_SELECTION;
    const selectedAgentAvailable = explicitSelectedAgent
        ? availableAgents.some((agent) => agent.name === explicitSelectedAgent)
        : true;
    const defaultAgentLabel = defaultAgent ?? 'auto route';

    return (
        <div className="composer-shell">
            {currentActiveRun ? (
                <div className="run-banner">
                    <div>
                        <strong>
                        {currentActiveRun.status === 'queued'
                                ? 'Run queued'
                                : 'Run in progress'}
                        </strong>
                        <div className="run-banner__meta">
                            {currentActiveRun.phase}
                            {currentActiveRun.latestError
                                ? ` · ${currentActiveRun.latestError}`
                                : ''}
                        </div>
                    </div>
                    <div className="run-banner__aside">
                        <span>
                            {(currentActiveRun.agent ?? 'orchestrator')} ·{' '}
                            {currentActiveRun.executionMode ?? 'foreground'} ·
                            started{' '}
                            {formatRelativeTime(currentActiveRun.startedAt)}
                        </span>
                        {currentActiveRun.streamContent ? (
                            <span className="run-banner__stream">
                                {currentActiveRun.streamContent.length} chars
                                streamed
                            </span>
                        ) : null}
                    </div>
                </div>
            ) : (
                <div className="hint-text">
                    Route the next turn through one agent, auto-routing, or a
                    shell-side memory search.
                </div>
            )}

            <div className="composer-card">
                <div className="composer-controlbar">
                    <label className="control-stack">
                        <span>Route</span>
                        <select
                            value={agentPickerValue}
                            onChange={(event) => onAgentChange(event.target.value)}
                        >
                            <option value={INHERIT_DEFAULT_AGENT_SELECTION}>
                                default · {defaultAgentLabel}
                            </option>
                            <option value={AUTO_ROUTE_AGENT_SELECTION}>
                                auto route
                            </option>
                            {!selectedAgentAvailable && explicitSelectedAgent ? (
                                <option value={explicitSelectedAgent}>
                                    {explicitSelectedAgent} (selected)
                                </option>
                            ) : null}
                            {availableAgents.map((agent) => (
                                <option key={agent.name} value={agent.name}>
                                    {agent.name}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="control-stack control-stack--mode">
                        <span>Exec</span>
                        <select
                            value={executionMode}
                            onChange={(event) =>
                                onExecutionModeChange(
                                    event.target.value as
                                        | 'foreground'
                                        | 'background',
                                )
                            }
                        >
                            <option value="foreground">foreground</option>
                            <option value="background">background</option>
                        </select>
                    </label>
                    <div className="composer-preview">
                        <span className="composer-preview__label">
                            Route preview
                        </span>
                    {composerShowsSearch ? (
                        <>
                            <span className="chip" data-tone="accent">
                                shell command
                            </span>
                            <span className="chip">/search</span>
                        </>
                    ) : chatUsesDefaultAgent && defaultAgent ? (
                        <>
                            <span className="chip" data-tone="teal">
                                default {defaultAgent}
                            </span>
                            <span className="chip">inherited</span>
                            <span className="chip">no fallback</span>
                        </>
                    ) : chatUsesAutoRoute ? (
                        <>
                            <span className="chip" data-tone="accent">
                                auto route
                            </span>
                            <span className="chip">chat override</span>
                        </>
                    ) : selectedAgent ? (
                        <>
                            <span className="chip" data-tone="teal">
                                agent {selectedAgent}
                            </span>
                            <span className="chip">manual</span>
                            <span className="chip">no fallback</span>
                        </>
                    ) : routePreview ? (
                        <>
                            <span className="chip" data-tone="teal">
                                route {routePreview.selectedAgent}
                            </span>
                            <span className="chip">
                                {routeReasonLabel(routePreview.reason)}
                            </span>
                            {routePreview.explicitAgent ? (
                                <span className="chip">explicit</span>
                            ) : null}
                            {routePreview.allowFallback &&
                            routePreview.fallbackChain.length > 1 ? (
                                <span className="chip">
                                    {routePreview.fallbackChain.length} fallback
                                    targets
                                </span>
                            ) : null}
                        </>
                    ) : (
                        <>
                            <span className="chip">shell idle</span>
                            <span className="chip">
                                type a prompt to preview routing
                            </span>
                        </>
                    )}
                </div>
                </div>
                <textarea
                    placeholder="Ask a coding agent, resume a thread, or use /search for shell-side memory."
                    value={composerText}
                    onChange={(event) =>
                        onComposerTextChange(event.target.value)
                    }
                />
                <div className="composer-toolbar">
                    <div className="composer-shortcuts">
                        <span className="hint">Quick route</span>
                        <button
                            className="quiet-btn"
                            data-active={chatUsesAutoRoute ? 'true' : undefined}
                            onClick={() =>
                                onAgentChange(AUTO_ROUTE_AGENT_SELECTION)
                            }
                            type="button"
                        >
                            Auto
                        </button>
                        {availableAgents.slice(0, 4).map((agent) => (
                            <button
                                className="quiet-btn"
                                data-active={
                                    !chatUsesDefaultAgent &&
                                    !chatUsesAutoRoute &&
                                    selectedAgent === agent.name
                                        ? 'true'
                                        : undefined
                                }
                                key={agent.name}
                                onClick={() => onAgentChange(agent.name)}
                                type="button"
                            >
                                {agent.name}
                            </button>
                        ))}
                    </div>
                    <div className="composer-controls">
                        <button
                            className="ghost-btn"
                            onClick={onStartSearch}
                            type="button"
                        >
                            /search
                        </button>
                        <button
                            className="btn"
                            disabled={!canSend}
                            onClick={onSend}
                            type="button"
                        >
                            {submitting ? 'Running…' : 'Send'}
                        </button>
                    </div>
                </div>
                {lastRun?.chatId === selectedChatId ? (
                    <div className="hint-strip">
                        <div className="hint">Last run via {lastRun.agent}</div>
                        <div className="hint">
                            {formatDuration(lastRun.duration)}
                        </div>
                        <div className="hint">
                            run {lastRun.runId.slice(0, 8)}
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
