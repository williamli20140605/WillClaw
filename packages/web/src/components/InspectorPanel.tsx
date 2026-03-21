import {
    AUTH_SCOPE_OPTIONS,
    type ActiveRun,
    type AuthSessionSummary,
    type AuthTokenSummary,
    type CreatedAuthToken,
    type CreatedPairingInvite,
    type InspectorTab,
    type MemorySearchResult,
    type PairingPayload,
    type ProviderHealthEntry,
    type QueueSummary,
    type RealtimeEvent,
    type SchedulerTaskStatus,
    type SearchScope,
    type StatusPayload,
    type ToolLogEntry,
} from '../ui-types.js';
import {
    cleanSnippet,
    describeRealtimeEvent,
    formatDuration,
    formatRelativeTime,
    formatTimestamp,
    summarizeText,
    taskTone,
    toolPolicySummary,
} from '../ui-helpers.js';

interface BrowserFormFieldInput {
    selector: string;
    text?: string;
    clear?: boolean;
}

interface InspectorPanelProps {
    authAdminBusy: boolean;
    authSessions: AuthSessionSummary[];
    authTokenSummaries: AuthTokenSummary[];
    browserFormFieldsText: string;
    browserSubmitSelector: string;
    browserTarget: string;
    canManageAuth: boolean;
    currentActiveRun: ActiveRun | null;
    currentRecentEvents: RealtimeEvent[];
    deferredSearchQuery: string;
    handleCreateManagedToken(): void;
    handleCreatePairingInvite(): void;
    handleInjectIntoComposer(content: string): void;
    handleRevokeAuthSession(sessionId: string): void;
    handleRevokeAuthToken(tokenId: string): void;
    handleRevokePairingGrant(grantId: string): void;
    handleRevokePairingInvite(inviteId: string): void;
    handleSelectChat(chatId: string): void;
    handleTaskRun(endpoint: string): void;
    hostActionBusy: boolean;
    hostActionResult: string;
    inspectorTab: InspectorTab;
    latestManagedToken: CreatedAuthToken | null;
    managedTokenId: string;
    managedTokenScopes: string[];
    pairingBusy: boolean;
    pairingChannel: 'telegram' | 'discord' | 'feishu';
    pairingInvite: CreatedPairingInvite | null;
    pairingKind: 'web' | 'channel';
    pairingState: PairingPayload | null;
    parseBrowserFormFields(): BrowserFormFieldInput[];
    providerHealth: ProviderHealthEntry[];
    runHostAction(endpoint: string, payload: Record<string, unknown>): void;
    schedulerTasks: SchedulerTaskStatus[];
    screenApp: string;
    screenInputText: string;
    screenSendClear: boolean;
    screenSendInspectAfter: boolean;
    screenSendLaunchIfNeeded: boolean;
    screenSendPressReturn: boolean;
    screenSendRequireFrontmost: boolean;
    searchLoading: boolean;
    searchQuery: string;
    searchResults: MemorySearchResult | null;
    searchScope: SearchScope;
    selectedChatId: string;
    selectedChatQueue: QueueSummary | null;
    setActionError(message: string): void;
    setBrowserFormFieldsText(value: string): void;
    setBrowserSubmitSelector(value: string): void;
    setBrowserTarget(value: string): void;
    setInspectorTab(tab: InspectorTab): void;
    setManagedTokenId(value: string): void;
    setPairingChannel(value: 'telegram' | 'discord' | 'feishu'): void;
    setPairingKind(value: 'web' | 'channel'): void;
    setScreenApp(value: string): void;
    setScreenInputText(value: string): void;
    setScreenSendClear(value: boolean): void;
    setScreenSendInspectAfter(value: boolean): void;
    setScreenSendLaunchIfNeeded(value: boolean): void;
    setScreenSendPressReturn(value: boolean): void;
    setScreenSendRequireFrontmost(value: boolean): void;
    setSearchQuery(value: string): void;
    setSearchScope(value: SearchScope): void;
    status: StatusPayload | null;
    toggleManagedTokenScope(
        scope: (typeof AUTH_SCOPE_OPTIONS)[number],
    ): void;
    toolLogs: ToolLogEntry[];
}

export function InspectorPanel({
    authAdminBusy,
    authSessions,
    authTokenSummaries,
    browserFormFieldsText,
    browserSubmitSelector,
    browserTarget,
    canManageAuth,
    currentActiveRun,
    currentRecentEvents,
    deferredSearchQuery,
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
    inspectorTab,
    latestManagedToken,
    managedTokenId,
    managedTokenScopes,
    pairingBusy,
    pairingChannel,
    pairingInvite,
    pairingKind,
    pairingState,
    parseBrowserFormFields,
    providerHealth,
    runHostAction,
    schedulerTasks,
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
    selectedChatQueue,
    setActionError,
    setBrowserFormFieldsText,
    setBrowserSubmitSelector,
    setBrowserTarget,
    setInspectorTab,
    setManagedTokenId,
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
    toggleManagedTokenScope,
    toolLogs,
}: InspectorPanelProps) {
    return (
        <aside className="panel inspector">
            <div className="inspector-header">
                <div>
                    <h2>Inspector</h2>
                    <p>
                        Debug and shell metadata stay nearby, not in the main
                        reading lane.
                    </p>
                </div>
            </div>

            <div className="inspector-tabs">
                {(['search', 'activity', 'runtime'] as InspectorTab[]).map(
                    (tab) => (
                        <button
                            className="inspector-tab"
                            data-active={inspectorTab === tab}
                            key={tab}
                            onClick={() => setInspectorTab(tab)}
                            type="button"
                        >
                            {tab}
                        </button>
                    ),
                )}
            </div>

            <div className="inspector-body">
                {inspectorTab === 'search' ? (
                    <div className="stack-list">
                        <section className="inspector-panel">
                            <div className="section-header">
                                <h3>Memory Search</h3>
                                <span>messages + files</span>
                            </div>
                            <div className="search-card">
                                <div className="search-grid">
                                    <input
                                        placeholder="Search memory and notes…"
                                        value={searchQuery}
                                        onChange={(event) =>
                                            setSearchQuery(event.target.value)
                                        }
                                    />
                                    <select
                                        value={searchScope}
                                        onChange={(event) =>
                                            setSearchScope(
                                                event.target.value as SearchScope,
                                            )
                                        }
                                    >
                                        <option value="all">all</option>
                                        <option value="messages">messages</option>
                                        <option value="files">files</option>
                                        <option value="memory">memory</option>
                                        <option value="daily_note">
                                            daily notes
                                        </option>
                                    </select>
                                </div>
                            </div>
                        </section>

                        {searchLoading ? (
                            <div className="empty">Searching…</div>
                        ) : null}

                        {searchResults?.messages.length ? (
                            <section className="inspector-panel">
                                <div className="section-header">
                                    <h3>Message Hits</h3>
                                    <span>{searchResults.messages.length}</span>
                                </div>
                                <div className="stack-list">
                                    {searchResults.messages.map((entry) => (
                                        <article
                                            className="result-card"
                                            key={`message-${entry.id}`}
                                        >
                                            <strong>
                                                {entry.chatId} · {entry.role}
                                            </strong>
                                            <p className="muted">
                                                {cleanSnippet(entry.snippet)}
                                            </p>
                                            <div className="result-actions">
                                                <button
                                                    className="quiet-btn"
                                                    onClick={() => {
                                                        handleSelectChat(
                                                            entry.chatId,
                                                        );
                                                        setInspectorTab(
                                                            'activity',
                                                        );
                                                    }}
                                                    type="button"
                                                >
                                                    Open chat
                                                </button>
                                                <button
                                                    className="ghost-btn"
                                                    onClick={() =>
                                                        handleInjectIntoComposer(
                                                            entry.content,
                                                        )
                                                    }
                                                    type="button"
                                                >
                                                    Quote
                                                </button>
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            </section>
                        ) : null}

                        {searchResults?.files.length ? (
                            <section className="inspector-panel">
                                <div className="section-header">
                                    <h3>File Hits</h3>
                                    <span>{searchResults.files.length}</span>
                                </div>
                                <div className="stack-list">
                                    {searchResults.files.map((entry) => (
                                        <article
                                            className="result-card"
                                            key={`file-${entry.id}`}
                                        >
                                            <strong>{entry.filepath}</strong>
                                            <p className="muted">
                                                {cleanSnippet(entry.snippet)}
                                            </p>
                                            <div className="result-actions">
                                                <button
                                                    className="ghost-btn"
                                                    onClick={() =>
                                                        handleInjectIntoComposer(
                                                            entry.content,
                                                        )
                                                    }
                                                    type="button"
                                                >
                                                    Insert excerpt
                                                </button>
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            </section>
                        ) : null}

                        {!searchLoading &&
                        deferredSearchQuery.length >= 2 &&
                        !searchResults?.messages.length &&
                        !searchResults?.files.length ? (
                            <div className="empty">
                                No results for “{deferredSearchQuery}”.
                            </div>
                        ) : null}
                    </div>
                ) : null}

                {inspectorTab === 'activity' ? (
                    <div className="stack-list">
                        <section className="inspector-panel">
                            <div className="section-header">
                                <h3>Run Status</h3>
                                <span>{selectedChatId}</span>
                            </div>
                            {currentActiveRun ? (
                                <article className="task-card">
                                    <strong>
                                        run {currentActiveRun.runId.slice(0, 8)}
                                    </strong>
                                    <div className="chip-row">
                                        <span
                                            className="chip"
                                            data-tone="accent"
                                        >
                                            {currentActiveRun.status}
                                        </span>
                                        {currentActiveRun.executionMode ? (
                                            <span className="chip">
                                                {currentActiveRun.executionMode}
                                            </span>
                                        ) : null}
                                        {currentActiveRun.agent ? (
                                            <span className="chip">
                                                {currentActiveRun.agent}
                                            </span>
                                        ) : null}
                                    </div>
                                    <p className="muted">
                                        Started{' '}
                                        {formatRelativeTime(
                                            currentActiveRun.startedAt,
                                        )}
                                    </p>
                                    <p className="muted">
                                        {currentActiveRun.phase}
                                    </p>
                                    {currentActiveRun.streamContent ? (
                                        <p className="muted">
                                            Preview:{' '}
                                            {summarizeText(
                                                currentActiveRun.streamContent,
                                                160,
                                            )}
                                        </p>
                                    ) : null}
                                </article>
                            ) : (
                                <div className="empty">
                                    No active run for this conversation.
                                </div>
                            )}
                        </section>

                        <section className="inspector-panel">
                            <div className="section-header">
                                <h3>Recent Events</h3>
                                <span>{currentRecentEvents.length}</span>
                            </div>
                            <div className="stack-list">
                                {currentRecentEvents.length === 0 ? (
                                    <div className="empty">
                                        Waiting for chat events.
                                    </div>
                                ) : (
                                    currentRecentEvents.map((event) => {
                                        const descriptor =
                                            describeRealtimeEvent(event);

                                        return (
                                            <article
                                                className="task-card"
                                                key={event.id}
                                            >
                                                <strong>
                                                    {descriptor.title}
                                                </strong>
                                                <p className="muted">
                                                    {descriptor.detail}
                                                </p>
                                                <p className="muted">
                                                    {formatTimestamp(
                                                        event.timestamp,
                                                    )}
                                                </p>
                                            </article>
                                        );
                                    })
                                )}
                            </div>
                        </section>

                        <section className="inspector-panel">
                            <div className="section-header">
                                <h3>Tool Logs</h3>
                                <span>{toolLogs.length} latest</span>
                            </div>
                            <div className="stack-list">
                                {toolLogs.length === 0 ? (
                                    <div className="empty">
                                        No tool activity recorded for this chat
                                        yet.
                                    </div>
                                ) : (
                                    toolLogs.map((entry) => (
                                        <article
                                            className="log-card"
                                            key={entry.id}
                                        >
                                            <strong>
                                                {entry.tool}.{entry.action}
                                            </strong>
                                            <div className="chip-row">
                                                <span
                                                    className="chip"
                                                    data-tone={
                                                        entry.success
                                                            ? 'teal'
                                                            : 'danger'
                                                    }
                                                >
                                                    {entry.success
                                                        ? 'success'
                                                        : 'failed'}
                                                </span>
                                                <span className="chip">
                                                    {formatDuration(
                                                        entry.durationMs,
                                                    )}
                                                </span>
                                                <span className="chip">
                                                    {entry.agent}
                                                </span>
                                            </div>
                                            <p className="log-snippet">
                                                {summarizeText(
                                                    entry.input,
                                                    120,
                                                )}
                                            </p>
                                        </article>
                                    ))
                                )}
                            </div>
                        </section>
                    </div>
                ) : null}

                {inspectorTab === 'runtime' ? (
                    <div className="stack-list">
                        <section className="inspector-panel">
                            <div className="section-header">
                                <h3>Scheduler</h3>
                                <span>{schedulerTasks.length} tasks</span>
                            </div>
                            <div className="toolbar">
                                <button
                                    className="ghost-btn"
                                    onClick={() =>
                                        handleTaskRun('/api/heartbeat/run')
                                    }
                                    type="button"
                                >
                                    Run heartbeat
                                </button>
                                <button
                                    className="ghost-btn"
                                    onClick={() =>
                                        handleTaskRun(
                                            '/api/cron/daily_briefing/run',
                                        )
                                    }
                                    type="button"
                                >
                                    Run briefing
                                </button>
                                <button
                                    className="ghost-btn"
                                    onClick={() =>
                                        handleTaskRun(
                                            '/api/maintenance/daily_note/run',
                                        )
                                    }
                                    type="button"
                                >
                                    Daily note
                                </button>
                                <button
                                    className="ghost-btn"
                                    onClick={() =>
                                        handleTaskRun(
                                            '/api/maintenance/compact/run',
                                        )
                                    }
                                    type="button"
                                >
                                    Compact memory
                                </button>
                            </div>
                            <div className="stack-list">
                                {schedulerTasks.map((task) => (
                                    <article
                                        className="task-card"
                                        key={task.id}
                                    >
                                        <strong>{task.name}</strong>
                                        <div className="chip-row">
                                            <span
                                                className="chip"
                                                data-tone={taskTone(
                                                    task.lastResult,
                                                )}
                                            >
                                                {task.lastResult ?? 'never run'}
                                            </span>
                                            <span className="chip">
                                                {task.kind}
                                            </span>
                                            <span className="chip">
                                                {task.schedule}
                                            </span>
                                        </div>
                                        <p className="muted">
                                            Last run:{' '}
                                            {formatTimestamp(task.lastRunAt)}
                                        </p>
                                    </article>
                                ))}
                            </div>
                        </section>

                        <section className="inspector-panel">
                            <div className="section-header">
                                <h3>Queue</h3>
                                <span>
                                    {selectedChatQueue
                                        ? `${selectedChatQueue.total} pending`
                                        : 'idle'}
                                </span>
                            </div>
                            {selectedChatQueue ? (
                                <div className="stack-list">
                                    {selectedChatQueue.runs.map((run) => (
                                        <article
                                            className="task-card"
                                            key={run.runId}
                                        >
                                            <strong>
                                                {run.status === 'running'
                                                    ? 'Running now'
                                                    : `Queued #${run.position}`}
                                            </strong>
                                            <div className="chip-row">
                                                <span
                                                    className="chip"
                                                    data-tone={
                                                        run.status === 'running'
                                                            ? 'teal'
                                                            : 'accent'
                                                    }
                                                >
                                                    {run.status}
                                                </span>
                                                <span className="chip">
                                                    run {run.runId.slice(0, 8)}
                                                </span>
                                                <span className="chip">
                                                    msg #{run.userMessageId}
                                                </span>
                                            </div>
                                            <p className="muted">
                                                {run.status === 'running'
                                                    ? 'This run is currently executing for the selected thread.'
                                                    : `${run.ahead} run(s) ahead in this thread.`}
                                            </p>
                                        </article>
                                    ))}
                                </div>
                            ) : (
                                <div className="empty">
                                    No queued work in this thread right now.
                                </div>
                            )}
                        </section>

                        <section className="inspector-panel">
                            <div className="section-header">
                                <h3>Host Lab</h3>
                                <span>agent-browser / peekaboo / macOS</span>
                            </div>
                            <div className="stack-list">
                                <article className="host-action-card">
                                    <label
                                        className="field-label"
                                        htmlFor="browser-target"
                                    >
                                        Browser target
                                    </label>
                                    <input
                                        className="field-input"
                                        id="browser-target"
                                        onChange={(event) =>
                                            setBrowserTarget(event.target.value)
                                        }
                                        placeholder="https://example.com"
                                        type="url"
                                        value={browserTarget}
                                    />
                                    <label
                                        className="field-label"
                                        htmlFor="browser-form-fields"
                                    >
                                        Browser form fields (JSON)
                                    </label>
                                    <textarea
                                        className="field-input"
                                        id="browser-form-fields"
                                        onChange={(event) =>
                                            setBrowserFormFieldsText(
                                                event.target.value,
                                            )
                                        }
                                        rows={6}
                                        spellCheck={false}
                                        value={browserFormFieldsText}
                                    />
                                    <label
                                        className="field-label"
                                        htmlFor="browser-submit-selector"
                                    >
                                        Submit selector (optional)
                                    </label>
                                    <input
                                        className="field-input"
                                        id="browser-submit-selector"
                                        onChange={(event) =>
                                            setBrowserSubmitSelector(
                                                event.target.value,
                                            )
                                        }
                                        placeholder="button[type=submit]"
                                        type="text"
                                        value={browserSubmitSelector}
                                    />
                                    <div className="toolbar">
                                        <button
                                            className="ghost-btn"
                                            disabled={
                                                hostActionBusy ||
                                                !screenApp.trim()
                                            }
                                            onClick={() =>
                                                runHostAction(
                                                    '/api/tools/screen/inspect-app',
                                                    {
                                                        chatId: selectedChatId,
                                                        app: screenApp.trim(),
                                                        languages: [
                                                            'en-US',
                                                            'zh-Hans',
                                                        ],
                                                    },
                                                )
                                            }
                                            type="button"
                                        >
                                            Inspect App
                                        </button>
                                        <button
                                            className="ghost-btn"
                                            disabled={hostActionBusy}
                                            onClick={() =>
                                                runHostAction(
                                                    '/api/tools/screen/frontmost-app',
                                                    {
                                                        chatId: selectedChatId,
                                                    },
                                                )
                                            }
                                            type="button"
                                        >
                                            Frontmost App
                                        </button>
                                        <button
                                            className="ghost-btn"
                                            disabled={
                                                hostActionBusy ||
                                                !screenApp.trim()
                                            }
                                            onClick={() =>
                                                runHostAction(
                                                    '/api/tools/screen/open-app',
                                                    {
                                                        chatId: selectedChatId,
                                                        app: screenApp.trim(),
                                                    },
                                                )
                                            }
                                            type="button"
                                        >
                                            Open App
                                        </button>
                                        <button
                                            className="ghost-btn"
                                            disabled={
                                                hostActionBusy ||
                                                !screenApp.trim()
                                            }
                                            onClick={() =>
                                                runHostAction(
                                                    '/api/tools/screen/activate-app',
                                                    {
                                                        chatId: selectedChatId,
                                                        app: screenApp.trim(),
                                                    },
                                                )
                                            }
                                            type="button"
                                        >
                                            Activate App
                                        </button>
                                        <button
                                            className="ghost-btn"
                                            disabled={hostActionBusy}
                                            onClick={() =>
                                                runHostAction(
                                                    '/api/tools/browser/open',
                                                    {
                                                        chatId: selectedChatId,
                                                        target:
                                                            browserTarget.trim(),
                                                    },
                                                )
                                            }
                                            type="button"
                                        >
                                            Open URL
                                        </button>
                                        <button
                                            className="ghost-btn"
                                            disabled={hostActionBusy}
                                            onClick={() =>
                                                runHostAction(
                                                    '/api/tools/browser/inspect-page',
                                                    {
                                                        chatId: selectedChatId,
                                                        target:
                                                            browserTarget.trim(),
                                                        interactive: true,
                                                        compact: true,
                                                    },
                                                )
                                            }
                                            type="button"
                                        >
                                            Inspect Page
                                        </button>
                                        <button
                                            className="ghost-btn"
                                            disabled={hostActionBusy}
                                            onClick={() => {
                                                try {
                                                    const fields =
                                                        parseBrowserFormFields();
                                                    runHostAction(
                                                        '/api/tools/browser/fill-form',
                                                        {
                                                            chatId:
                                                                selectedChatId,
                                                            target:
                                                                browserTarget.trim(),
                                                            fields,
                                                            ...(browserSubmitSelector.trim()
                                                                ? {
                                                                    submitSelector:
                                                                        browserSubmitSelector.trim(),
                                                                }
                                                                : {}),
                                                            interactive: true,
                                                            compact: true,
                                                        },
                                                    );
                                                } catch (error) {
                                                    setActionError(
                                                        error instanceof Error
                                                            ? error.message
                                                            : 'Invalid form field JSON.',
                                                    );
                                                }
                                            }}
                                            type="button"
                                        >
                                            Fill Form
                                        </button>
                                        <button
                                            className="ghost-btn"
                                            disabled={hostActionBusy}
                                            onClick={() =>
                                                runHostAction(
                                                    '/api/tools/browser/snapshot',
                                                    {
                                                        chatId: selectedChatId,
                                                        interactive: true,
                                                        compact: true,
                                                    },
                                                )
                                            }
                                            type="button"
                                        >
                                            Snapshot
                                        </button>
                                        <button
                                            className="ghost-btn"
                                            disabled={hostActionBusy}
                                            onClick={() =>
                                                runHostAction(
                                                    '/api/tools/browser/screenshot',
                                                    {
                                                        chatId: selectedChatId,
                                                        filePath: `/tmp/willclaw-browser-${Date.now().toString(36)}.png`,
                                                        fullPage: true,
                                                    },
                                                )
                                            }
                                            type="button"
                                        >
                                            Screenshot
                                        </button>
                                    </div>
                                    <p className="muted">
                                        Reuses the current web chat as the hosted
                                        browser session.
                                    </p>
                                </article>

                                <article className="host-action-card">
                                    <label
                                        className="field-label"
                                        htmlFor="screen-app"
                                    >
                                        Desktop app (optional)
                                    </label>
                                    <input
                                        className="field-input"
                                        id="screen-app"
                                        onChange={(event) =>
                                            setScreenApp(event.target.value)
                                        }
                                        placeholder="Terminal"
                                        type="text"
                                        value={screenApp}
                                    />
                                    <label
                                        className="field-label"
                                        htmlFor="screen-input-text"
                                    >
                                        Text to send
                                    </label>
                                    <textarea
                                        className="field-input code-input"
                                        id="screen-input-text"
                                        onChange={(event) =>
                                            setScreenInputText(
                                                event.target.value,
                                            )
                                        }
                                        placeholder="hello from WillClaw"
                                        rows={4}
                                        value={screenInputText}
                                    />
                                    <div className="field-option-grid">
                                        <label
                                            className="field-option"
                                            htmlFor="screen-send-launch"
                                        >
                                            <input
                                                checked={
                                                    screenSendLaunchIfNeeded
                                                }
                                                disabled={
                                                    screenSendRequireFrontmost
                                                }
                                                id="screen-send-launch"
                                                onChange={(event) =>
                                                    setScreenSendLaunchIfNeeded(
                                                        event.target.checked,
                                                    )
                                                }
                                                type="checkbox"
                                            />
                                            <span>Launch app if needed</span>
                                        </label>
                                        <label
                                            className="field-option"
                                            htmlFor="screen-send-clear"
                                        >
                                            <input
                                                checked={screenSendClear}
                                                id="screen-send-clear"
                                                onChange={(event) =>
                                                    setScreenSendClear(
                                                        event.target.checked,
                                                    )
                                                }
                                                type="checkbox"
                                            />
                                            <span>Clear before typing</span>
                                        </label>
                                        <label
                                            className="field-option"
                                            htmlFor="screen-send-return"
                                        >
                                            <input
                                                checked={screenSendPressReturn}
                                                id="screen-send-return"
                                                onChange={(event) =>
                                                    setScreenSendPressReturn(
                                                        event.target.checked,
                                                    )
                                                }
                                                type="checkbox"
                                            />
                                            <span>Press Return after typing</span>
                                        </label>
                                        <label
                                            className="field-option"
                                            htmlFor="screen-send-inspect"
                                        >
                                            <input
                                                checked={
                                                    screenSendInspectAfter
                                                }
                                                id="screen-send-inspect"
                                                onChange={(event) =>
                                                    setScreenSendInspectAfter(
                                                        event.target.checked,
                                                    )
                                                }
                                                type="checkbox"
                                            />
                                            <span>Inspect after send</span>
                                        </label>
                                        <label
                                            className="field-option"
                                            htmlFor="screen-send-frontmost"
                                        >
                                            <input
                                                checked={
                                                    screenSendRequireFrontmost
                                                }
                                                id="screen-send-frontmost"
                                                onChange={(event) =>
                                                    setScreenSendRequireFrontmost(
                                                        event.target.checked,
                                                    )
                                                }
                                                type="checkbox"
                                            />
                                            <span>
                                                Only send if already frontmost
                                            </span>
                                        </label>
                                    </div>
                                    <div className="toolbar">
                                        <button
                                            className="ghost-btn"
                                            disabled={
                                                hostActionBusy ||
                                                !screenApp.trim() ||
                                                !screenInputText.trim()
                                            }
                                            onClick={() =>
                                                runHostAction(
                                                    '/api/tools/screen/send-text',
                                                    {
                                                        chatId: selectedChatId,
                                                        app: screenApp.trim(),
                                                        text: screenInputText,
                                                        clear: screenSendClear,
                                                        pressReturn:
                                                            screenSendPressReturn,
                                                        inspectAfter:
                                                            screenSendInspectAfter,
                                                        launchIfNeeded:
                                                            screenSendRequireFrontmost
                                                                ? false
                                                                : screenSendLaunchIfNeeded,
                                                        requireFrontmost:
                                                            screenSendRequireFrontmost,
                                                        languages: [
                                                            'en-US',
                                                            'zh-Hans',
                                                        ],
                                                    },
                                                )
                                            }
                                            type="button"
                                        >
                                            Send Text
                                        </button>
                                        <button
                                            className="ghost-btn"
                                            disabled={hostActionBusy}
                                            onClick={() =>
                                                runHostAction(
                                                    '/api/tools/screen/see',
                                                    {
                                                        chatId: selectedChatId,
                                                        ...(screenApp.trim()
                                                            ? {
                                                                app: screenApp.trim(),
                                                            }
                                                            : {
                                                                mode: 'frontmost',
                                                            }),
                                                        annotate: true,
                                                        path: `/tmp/willclaw-see-${Date.now().toString(36)}.png`,
                                                    },
                                                )
                                            }
                                            type="button"
                                        >
                                            Inspect UI
                                        </button>
                                        <button
                                            className="ghost-btn"
                                            disabled={hostActionBusy}
                                            onClick={() =>
                                                runHostAction(
                                                    '/api/tools/screen/capture',
                                                    {
                                                        chatId: selectedChatId,
                                                        ...(screenApp.trim()
                                                            ? {
                                                                app: screenApp.trim(),
                                                            }
                                                            : {
                                                                mode: 'screen',
                                                            }),
                                                        filePath: `/tmp/willclaw-screen-${Date.now().toString(36)}.png`,
                                                    },
                                                )
                                            }
                                            type="button"
                                        >
                                            Capture
                                        </button>
                                        <button
                                            className="ghost-btn"
                                            disabled={hostActionBusy}
                                            onClick={() =>
                                                runHostAction(
                                                    '/api/tools/screen/ocr',
                                                    {
                                                        chatId: selectedChatId,
                                                        ...(screenApp.trim()
                                                            ? {
                                                                app: screenApp.trim(),
                                                            }
                                                            : {
                                                                mode: 'screen',
                                                            }),
                                                    },
                                                )
                                            }
                                            type="button"
                                        >
                                            OCR
                                        </button>
                                    </div>
                                    <p className="muted">
                                        Uses macOS app control plus Peekaboo-first
                                        desktop actions. OCR uses Apple Vision
                                        after capture.
                                    </p>
                                    <div className="hint-text">
                                        Send Text normally brings the target app
                                        to the front, so your mouse and keyboard
                                        focus may jump briefly while it runs.
                                        Enable "Only send if already frontmost"
                                        to fail fast instead of switching apps.
                                    </div>
                                </article>

                                {hostActionResult ? (
                                    <article className="host-result-card">
                                        <div className="section-header">
                                            <h3>Last Host Result</h3>
                                            <span>JSON / text</span>
                                        </div>
                                        <pre className="host-result">
                                            {hostActionResult}
                                        </pre>
                                    </article>
                                ) : null}
                            </div>
                        </section>

                        <section className="inspector-panel">
                            <div className="section-header">
                                <h3>Pairing</h3>
                                <span>
                                    {pairingState?.enabled
                                        ? 'invite users'
                                        : 'disabled'}
                                </span>
                            </div>
                            <div className="stack-list">
                                <article className="host-action-card">
                                    <label
                                        className="field-label"
                                        htmlFor="pairing-kind"
                                    >
                                        Invite type
                                    </label>
                                    <div className="toolbar">
                                        <select
                                            className="field-input"
                                            id="pairing-kind"
                                            onChange={(event) =>
                                                setPairingKind(
                                                    event.target.value as
                                                        | 'web'
                                                        | 'channel',
                                                )
                                            }
                                            value={pairingKind}
                                        >
                                            <option value="web">web ui</option>
                                            <option value="channel">
                                                channel
                                            </option>
                                        </select>
                                        {pairingKind === 'channel' ? (
                                            <select
                                                className="field-input"
                                                onChange={(event) =>
                                                    setPairingChannel(
                                                        event.target.value as
                                                            | 'telegram'
                                                            | 'discord'
                                                            | 'feishu',
                                                    )
                                                }
                                                value={pairingChannel}
                                            >
                                                <option value="telegram">
                                                    telegram
                                                </option>
                                                <option value="discord">
                                                    discord
                                                </option>
                                                <option value="feishu">
                                                    feishu
                                                </option>
                                            </select>
                                        ) : null}
                                        <button
                                            className="btn"
                                            disabled={
                                                pairingBusy ||
                                                !pairingState?.enabled
                                            }
                                            onClick={handleCreatePairingInvite}
                                            type="button"
                                        >
                                            {pairingBusy
                                                ? 'Creating…'
                                                : 'Create invite'}
                                        </button>
                                    </div>
                                    <p className="muted">
                                        One-time codes are safer than handing
                                        out long-lived bearer tokens.
                                    </p>
                                </article>

                                {pairingInvite ? (
                                    <article className="host-result-card">
                                        <div className="section-header">
                                            <h3>Latest Invite</h3>
                                            <span>{pairingInvite.kind}</span>
                                        </div>
                                        <pre className="host-result">
{`code: ${pairingInvite.code}
expires: ${pairingInvite.expiresAt}
${pairingInvite.channels.length > 0 ? `channels: ${pairingInvite.channels.join(', ')}` : `scopes: ${pairingInvite.scopes.join(', ')}`}`}
                                        </pre>
                                    </article>
                                ) : null}

                                <article className="provider-card">
                                    <div className="status-line">
                                        <strong>Active invites</strong>
                                        <span className="chip">
                                            {pairingState?.invites.length ?? 0}
                                        </span>
                                    </div>
                                    <div className="stack-list">
                                        {(pairingState?.invites ?? [])
                                            .slice(0, 4)
                                            .map((invite) => (
                                                <div
                                                    key={invite.id}
                                                    className="provider-action-list"
                                                >
                                                    <strong>
                                                        {invite.kind} ·{' '}
                                                        {invite.codePreview}
                                                    </strong>
                                                    <span className="muted">
                                                        {invite.active
                                                            ? 'active'
                                                            : 'inactive'}{' '}
                                                        · uses{' '}
                                                        {invite.usedCount}/
                                                        {invite.maxUses}
                                                    </span>
                                                    {invite.revokedAt ? (
                                                        <span className="muted">
                                                            revoked{' '}
                                                            {formatTimestamp(
                                                                invite.revokedAt,
                                                            )}
                                                        </span>
                                                    ) : null}
                                                    <div className="toolbar">
                                                        <button
                                                            className="ghost-btn"
                                                            disabled={
                                                                pairingBusy ||
                                                                !invite.active
                                                            }
                                                            onClick={() =>
                                                                handleRevokePairingInvite(
                                                                    invite.id,
                                                                )
                                                            }
                                                            type="button"
                                                        >
                                                            Revoke
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        {(pairingState?.invites.length ?? 0) ===
                                        0 ? (
                                            <div className="empty">
                                                No pairing invites yet.
                                            </div>
                                        ) : null}
                                    </div>
                                </article>

                                <article className="provider-card">
                                    <div className="status-line">
                                        <strong>Granted users</strong>
                                        <span className="chip">
                                            {pairingState?.grants.length ?? 0}
                                        </span>
                                    </div>
                                    <div className="stack-list">
                                        {(pairingState?.grants ?? [])
                                            .slice(0, 4)
                                            .map((grant) => (
                                                <div
                                                    key={grant.id}
                                                    className="provider-action-list"
                                                >
                                                    <strong>
                                                        {grant.channel} ·{' '}
                                                        {grant.userId}
                                                    </strong>
                                                    <span className="muted">
                                                        invite{' '}
                                                        {grant.inviteId.slice(
                                                            0,
                                                            8,
                                                        )}
                                                    </span>
                                                    <div className="toolbar">
                                                        <button
                                                            className="ghost-btn"
                                                            disabled={
                                                                pairingBusy
                                                            }
                                                            onClick={() =>
                                                                handleRevokePairingGrant(
                                                                    grant.id,
                                                                )
                                                            }
                                                            type="button"
                                                        >
                                                            Revoke
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        {(pairingState?.grants.length ?? 0) ===
                                        0 ? (
                                            <div className="empty">
                                                No paired channel users yet.
                                            </div>
                                        ) : null}
                                    </div>
                                </article>
                            </div>
                        </section>

                        <section className="inspector-panel">
                            <div className="section-header">
                                <h3>Auth</h3>
                                <span>
                                    {canManageAuth
                                        ? 'session scope'
                                        : 'read-only'}
                                </span>
                            </div>
                            <div className="stack-list">
                                <article className="host-action-card">
                                    <label
                                        className="field-label"
                                        htmlFor="managed-token-id"
                                    >
                                        Managed token id (optional)
                                    </label>
                                    <input
                                        className="field-input"
                                        disabled={
                                            !canManageAuth || authAdminBusy
                                        }
                                        id="managed-token-id"
                                        onChange={(event) =>
                                            setManagedTokenId(
                                                event.target.value,
                                            )
                                        }
                                        placeholder="ops-web"
                                        type="text"
                                        value={managedTokenId}
                                    />
                                    <div className="chip-row">
                                        {AUTH_SCOPE_OPTIONS.map((scope) => (
                                            <button
                                                className="ghost-btn"
                                                data-tone={
                                                    managedTokenScopes.includes(
                                                        scope,
                                                    )
                                                        ? 'teal'
                                                        : undefined
                                                }
                                                disabled={
                                                    !canManageAuth ||
                                                    authAdminBusy
                                                }
                                                key={scope}
                                                onClick={() =>
                                                    toggleManagedTokenScope(
                                                        scope,
                                                    )
                                                }
                                                type="button"
                                            >
                                                {scope}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="toolbar">
                                        <button
                                            className="btn"
                                            disabled={
                                                !canManageAuth ||
                                                authAdminBusy ||
                                                managedTokenScopes.length === 0
                                            }
                                            onClick={
                                                handleCreateManagedToken
                                            }
                                            type="button"
                                        >
                                            {authAdminBusy
                                                ? 'Working…'
                                                : 'Create token'}
                                        </button>
                                    </div>
                                    <p className="muted">
                                        Managed tokens are stored as hashes on
                                        disk. The raw token is only shown once
                                        after creation.
                                    </p>
                                </article>

                                {latestManagedToken ? (
                                    <article className="host-result-card">
                                        <div className="section-header">
                                            <h3>Latest Managed Token</h3>
                                            <span>{latestManagedToken.id}</span>
                                        </div>
                                        <pre className="host-result">
{`token: ${latestManagedToken.token}
created: ${latestManagedToken.createdAt}
scopes: ${latestManagedToken.scopes.join(', ')}`}
                                        </pre>
                                    </article>
                                ) : null}

                                <article className="provider-card">
                                    <div className="status-line">
                                        <strong>Auth Tokens</strong>
                                        <span className="chip">
                                            {authTokenSummaries.length}
                                        </span>
                                    </div>
                                    <div className="stack-list">
                                        {authTokenSummaries.slice(0, 4).map(
                                            (token) => (
                                                <div
                                                    key={[
                                                        token.source,
                                                        token.id,
                                                        token.createdAt ?? '',
                                                        token.tokenPreview ??
                                                            '',
                                                    ].join(':')}
                                                    className="provider-action-list"
                                                >
                                                    <strong>{token.id}</strong>
                                                    <span className="muted">
                                                        {token.source} ·{' '}
                                                        {token.legacy
                                                            ? 'legacy owner'
                                                            : token.scopes.join(
                                                                ', ',
                                                            )}
                                                    </span>
                                                    {token.tokenPreview ? (
                                                        <span className="muted">
                                                            preview{' '}
                                                            {token.tokenPreview}
                                                        </span>
                                                    ) : null}
                                                    {token.createdAt ? (
                                                        <span className="muted">
                                                            created{' '}
                                                            {formatTimestamp(
                                                                token.createdAt,
                                                            )}
                                                        </span>
                                                    ) : null}
                                                    {token.revokedAt ? (
                                                        <span className="muted">
                                                            revoked{' '}
                                                            {formatTimestamp(
                                                                token.revokedAt,
                                                            )}
                                                        </span>
                                                    ) : null}
                                                    {token.source ===
                                                    'managed' ? (
                                                        <div className="toolbar">
                                                            <button
                                                                className="ghost-btn"
                                                                disabled={
                                                                    !canManageAuth ||
                                                                    authAdminBusy ||
                                                                    !token.active
                                                                }
                                                                onClick={() =>
                                                                    handleRevokeAuthToken(
                                                                        token.id,
                                                                    )
                                                                }
                                                                type="button"
                                                            >
                                                                Revoke
                                                            </button>
                                                        </div>
                                                    ) : null}
                                                </div>
                                            ),
                                        )}
                                        {authTokenSummaries.length === 0 ? (
                                            <div className="empty">
                                                {canManageAuth
                                                    ? 'No auth tokens.'
                                                    : 'This session cannot inspect auth tokens.'}
                                            </div>
                                        ) : null}
                                    </div>
                                </article>

                                <article className="provider-card">
                                    <div className="status-line">
                                        <strong>Active Sessions</strong>
                                        <span className="chip">
                                            {authSessions.length}
                                        </span>
                                    </div>
                                    <div className="stack-list">
                                        {authSessions.slice(0, 6).map(
                                            (session) => (
                                                <div
                                                    key={session.id}
                                                    className="provider-action-list"
                                                >
                                                    <strong>
                                                        {session.tokenId}
                                                    </strong>
                                                    <span className="muted">
                                                        created{' '}
                                                        {formatTimestamp(
                                                            session.createdAt,
                                                        )}
                                                    </span>
                                                    <span className="muted">
                                                        expires{' '}
                                                        {formatTimestamp(
                                                            session.expiresAt,
                                                        )}
                                                    </span>
                                                    <div className="toolbar">
                                                        <button
                                                            className="ghost-btn"
                                                            disabled={
                                                                !canManageAuth ||
                                                                authAdminBusy
                                                            }
                                                            onClick={() =>
                                                                handleRevokeAuthSession(
                                                                    session.id,
                                                                )
                                                            }
                                                            type="button"
                                                        >
                                                            Revoke
                                                        </button>
                                                    </div>
                                                </div>
                                            ),
                                        )}
                                        {authSessions.length === 0 ? (
                                            <div className="empty">
                                                {canManageAuth
                                                    ? 'No active sessions.'
                                                    : 'This session cannot inspect auth sessions.'}
                                            </div>
                                        ) : null}
                                    </div>
                                </article>
                            </div>
                        </section>

                        <section className="inspector-panel">
                            <div className="section-header">
                                <h3>Providers</h3>
                                <span>{providerHealth.length} checks</span>
                            </div>
                            <div className="stack-list">
                                {providerHealth.map((entry) => (
                                    <article
                                        className="provider-card"
                                        key={`${entry.tool}-${entry.provider}`}
                                    >
                                        <div className="status-line">
                                            <strong>{entry.provider}</strong>
                                            <div className="chip-row">
                                                <span className="chip">
                                                    {entry.tool}
                                                </span>
                                                <span
                                                    className="chip"
                                                    data-tone={
                                                        entry.healthy
                                                            ? 'teal'
                                                            : entry.available
                                                                ? 'accent'
                                                                : 'danger'
                                                    }
                                                >
                                                    {entry.healthy
                                                        ? 'healthy'
                                                        : entry.available
                                                            ? 'degraded'
                                                            : 'missing'}
                                                </span>
                                            </div>
                                        </div>
                                        <p className="muted">
                                            {entry.detail}
                                        </p>
                                        <div className="chip-row">
                                            {entry.actions.map((action) => (
                                                <span
                                                    className="chip"
                                                    data-tone={
                                                        action.healthy
                                                            ? 'teal'
                                                            : action.available
                                                                ? 'accent'
                                                                : 'danger'
                                                    }
                                                    key={`${entry.provider}-${action.action}`}
                                                    title={action.detail}
                                                >
                                                    {action.action}
                                                </span>
                                            ))}
                                        </div>
                                        {entry.installHint ? (
                                            <p className="muted">
                                                Hint: {entry.installHint}
                                            </p>
                                        ) : null}
                                    </article>
                                ))}
                            </div>
                        </section>

                        <section className="inspector-panel">
                            <div className="section-header">
                                <h3>Agents</h3>
                                <span>{status?.server.port ?? 8420}</span>
                            </div>
                            <div className="stack-list">
                                {status?.agents.map((agent) => (
                                    <article
                                        className="agent-card"
                                        key={agent.name}
                                    >
                                        <div className="status-line">
                                            <strong>{agent.name}</strong>
                                            <span className="status-pill">
                                                <span
                                                    className="status-dot"
                                                    data-tone={
                                                        agent.available
                                                            ? 'teal'
                                                            : 'danger'
                                                    }
                                                />
                                                {agent.type}
                                            </span>
                                        </div>
                                        <div className="chip-row">
                                            <span
                                                className="chip"
                                                data-tone={
                                                    agent.available
                                                        ? 'teal'
                                                        : 'danger'
                                                }
                                            >
                                                {agent.available
                                                    ? 'available'
                                                    : 'unavailable'}
                                            </span>
                                            <span className="chip">
                                                {agent.enabled
                                                    ? 'enabled'
                                                    : 'disabled'}
                                            </span>
                                        </div>
                                        <p className="muted">
                                            {toolPolicySummary(agent)}
                                        </p>
                                    </article>
                                )) ?? (
                                    <div className="empty">
                                        Loading agent availability…
                                    </div>
                                )}
                            </div>
                        </section>

                        <section className="inspector-panel">
                            <div className="section-header">
                                <h3>Host Tools</h3>
                                <span>
                                    {status?.hostTools.length ?? 0} tools
                                </span>
                            </div>
                            <div className="stack-list">
                                {status?.hostTools.map((tool) => (
                                    <article
                                        className="tool-card"
                                        key={tool.name}
                                    >
                                        <div className="status-line">
                                            <strong>{tool.label}</strong>
                                            <span className="chip">
                                                {tool.mode ??
                                                    (tool.globalEnabled
                                                        ? 'enabled'
                                                        : 'disabled')}
                                            </span>
                                        </div>
                                        <p className="muted">
                                            {tool.category}
                                            {tool.preferredProvider
                                                ? ` · ${tool.preferredProvider}`
                                                : ''}
                                            {tool.fallbackProvider
                                                ? ` → ${tool.fallbackProvider}`
                                                : ''}
                                        </p>
                                    </article>
                                )) ?? (
                                    <div className="empty">
                                        Loading hosted tool policy…
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>
                ) : null}
            </div>
        </aside>
    );
}
