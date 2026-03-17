import { startTransition, useDeferredValue, useEffect, useState } from 'react';

type MessageRole = 'user' | 'assistant' | 'system';
type SchedulerResult = 'completed' | 'failed' | 'suppressed';
type SearchScope = 'all' | 'messages' | 'files' | 'memory' | 'daily_note';

interface AgentAvailability {
    name: string;
    type: string;
    enabled: boolean;
    available: boolean;
    toolPolicies: Record<string, string>;
}

interface HostTool {
    name: string;
    label: string;
    category: string;
    globalEnabled: boolean;
    preferredProvider?: string;
    fallbackProvider?: string;
    mode?: string;
}

interface StatusPayload {
    name: string;
    homeDir: string;
    configPath: string;
    server: {
        host: string;
        port: number;
    };
    hostTools: HostTool[];
    agents: AgentAvailability[];
}

interface StoredMessage {
    id: number;
    timestamp: string;
    channel: string;
    chatId: string;
    userId: string;
    role: MessageRole;
    content: string;
    agent?: string;
    durationMs?: number;
    status: 'active' | 'revoked';
    revokedAt?: string;
    editOf?: number;
    runId?: string;
}

interface ChatResult {
    runId: string;
    agent: string;
    content: string;
    duration: number;
    channel: string;
    chatId: string;
    userMessageId: number;
    assistantMessageId: number;
}

interface SearchMessageResult {
    id: number;
    timestamp: string;
    channel: string;
    chatId: string;
    role: MessageRole;
    content: string;
    snippet: string;
}

interface SearchFileResult {
    id: number;
    filepath: string;
    fileType: string;
    snippet: string;
    updatedAt: string;
    content: string;
}

interface MemorySearchResult {
    messages: SearchMessageResult[];
    files: SearchFileResult[];
}

interface ToolLogEntry {
    id: number;
    timestamp: string;
    tool: string;
    action: string;
    agent: string;
    chatId?: string;
    input: string;
    output?: string;
    exitCode?: number;
    durationMs: number;
    success: boolean;
    error?: string;
}

interface SchedulerTaskStatus {
    id: string;
    kind: 'heartbeat' | 'cron' | 'maintenance';
    name: string;
    schedule: string;
    running: boolean;
    lastRunAt?: string;
    lastResult?: SchedulerResult;
    lastError?: string;
}

interface CronPayload {
    heartbeat: SchedulerTaskStatus | null;
    cron: SchedulerTaskStatus[];
    maintenance: SchedulerTaskStatus[];
}

const WEB_CHANNEL = 'web';
const WEB_CHAT = 'default';
const WEB_USER = 'web-ui';

function formatTimestamp(value?: string): string {
    if (!value) {
        return 'Pending';
    }

    return new Date(value).toLocaleString();
}

function formatDuration(value?: number): string {
    if (!value) {
        return 'n/a';
    }

    if (value >= 1000) {
        return `${(value / 1000).toFixed(1)}s`;
    }

    return `${value}ms`;
}

function messageLabel(message: StoredMessage): string {
    if (message.role === 'assistant') {
        return message.agent ? `Assistant · ${message.agent}` : 'Assistant';
    }

    if (message.role === 'system') {
        return 'System';
    }

    return 'You';
}

async function readJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
    const response = await fetch(input, init);
    if (!response.ok) {
        let detail = response.statusText;

        try {
            const payload = (await response.json()) as { error?: string };
            if (payload.error) {
                detail = payload.error;
            }
        } catch {
            // ignore parse failures
        }

        throw new Error(detail);
    }

    return (await response.json()) as T;
}

function toolPolicySummary(agent: AgentAvailability): string {
    return Object.entries(agent.toolPolicies)
        .map(([tool, mode]) => `${tool}:${mode}`)
        .join(' · ');
}

function taskTone(result?: SchedulerResult): 'accent' | 'teal' | 'danger' {
    if (result === 'completed') {
        return 'teal';
    }

    if (result === 'failed') {
        return 'danger';
    }

    return 'accent';
}

export function App() {
    const [status, setStatus] = useState<StatusPayload | null>(null);
    const [messages, setMessages] = useState<StoredMessage[]>([]);
    const [toolLogs, setToolLogs] = useState<ToolLogEntry[]>([]);
    const [cronState, setCronState] = useState<CronPayload | null>(null);
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

    const deferredSearchQuery = useDeferredValue(searchQuery.trim());

    async function loadDashboard(): Promise<void> {
        try {
            const [statusPayload, messagePayload, toolLogPayload, cronPayload] =
                await Promise.all([
                    readJson<StatusPayload>('/api/status'),
                    readJson<StoredMessage[]>(
                        `/api/messages?channel=${WEB_CHANNEL}&chatId=${WEB_CHAT}&limit=80&includeRevoked=true`,
                    ),
                    readJson<ToolLogEntry[]>('/api/logs/tools?limit=12'),
                    readJson<CronPayload>('/api/cron'),
                ]);

            startTransition(() => {
                setStatus(statusPayload);
                setMessages(messagePayload);
                setToolLogs(toolLogPayload);
                setCronState(cronPayload);
            });
            setDashboardError('');
        } catch (error) {
            setDashboardError(
                error instanceof Error ? error.message : 'Failed to load dashboard.',
            );
        }
    }

    async function loadSearch(query: string): Promise<void> {
        if (query.length < 2) {
            setSearchResults(null);
            return;
        }

        setSearchLoading(true);

        try {
            const params = new URLSearchParams({
                query,
                messageLimit:
                    searchScope === 'files' || searchScope === 'memory' || searchScope === 'daily_note'
                        ? '0'
                        : '6',
                fileLimit: searchScope === 'messages' ? '0' : '6',
            });

            if (searchScope === 'memory') {
                params.set('fileType', 'memory');
            }

            if (searchScope === 'daily_note') {
                params.set('fileType', 'daily_note');
            }

            const payload = await readJson<MemorySearchResult>(
                `/api/memory/search?${params.toString()}`,
            );
            startTransition(() => {
                setSearchResults(payload);
            });
        } catch (error) {
            setActionError(
                error instanceof Error ? error.message : 'Search request failed.',
            );
        } finally {
            setSearchLoading(false);
        }
    }

    useEffect(() => {
        void loadDashboard();

        const interval = window.setInterval(() => {
            void loadDashboard();
        }, 5_000);

        return () => {
            window.clearInterval(interval);
        };
    }, []);

    useEffect(() => {
        void loadSearch(deferredSearchQuery);
    }, [deferredSearchQuery, searchScope]);

    async function handleSend(): Promise<void> {
        const text = composerText.trim();
        if (!text) {
            return;
        }

        setSubmitting(true);
        setActionError('');

        try {
            const result = await readJson<ChatResult>('/api/chat', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    text,
                    channel: WEB_CHANNEL,
                    chatId: WEB_CHAT,
                    userId: WEB_USER,
                    executionMode,
                }),
            });

            setLastRun(result);
            setComposerText('');
            await loadDashboard();
        } catch (error) {
            setActionError(error instanceof Error ? error.message : 'Chat failed.');
        } finally {
            setSubmitting(false);
        }
    }

    async function handleRevoke(messageId: number): Promise<void> {
        setActionError('');

        try {
            await readJson(`/api/messages/${messageId}/revoke`, {
                method: 'POST',
            });
            await loadDashboard();
        } catch (error) {
            setActionError(
                error instanceof Error ? error.message : 'Revoke failed.',
            );
        }
    }

    async function handleResend(messageId: number): Promise<void> {
        setActionError('');

        try {
            const result = await readJson<ChatResult>(`/api/messages/${messageId}/resend`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    channel: WEB_CHANNEL,
                    chatId: WEB_CHAT,
                    userId: WEB_USER,
                }),
            });
            setLastRun(result);
            await loadDashboard();
        } catch (error) {
            setActionError(
                error instanceof Error ? error.message : 'Resend failed.',
            );
        }
    }

    async function handleEditSave(messageId: number): Promise<void> {
        const text = editingText.trim();
        if (!text) {
            return;
        }

        setActionError('');

        try {
            const result = await readJson<{ result: ChatResult }>(
                `/api/messages/${messageId}/edit`,
                {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                    },
                    body: JSON.stringify({
                        text,
                    }),
                },
            );
            setEditingMessageId(null);
            setEditingText('');
            setLastRun(result.result);
            await loadDashboard();
        } catch (error) {
            setActionError(error instanceof Error ? error.message : 'Edit failed.');
        }
    }

    async function handleTaskRun(endpoint: string): Promise<void> {
        setActionError('');

        try {
            await readJson(endpoint, {
                method: 'POST',
            });
            await loadDashboard();
        } catch (error) {
            setActionError(
                error instanceof Error ? error.message : 'Task trigger failed.',
            );
        }
    }

    const availableAgents = status?.agents.filter((agent) => agent.available) ?? [];
    const totalTasks =
        (cronState?.heartbeat ? 1 : 0) +
        (cronState?.cron.length ?? 0) +
        (cronState?.maintenance.length ?? 0);

    return (
        <main className="shell">
            <header className="hero">
                <div className="hero-copy">
                    <div className="eyebrow">WillClaw Control Room</div>
                    <h1>Shell the agents. Keep the runtime.</h1>
                    <p>
                        WillClaw stays outside the coding agents and gives you one
                        place to route chats, search memory, inspect tool activity,
                        and kick background work.
                    </p>
                </div>
                <aside className="hero-note">
                    <strong>What this UI is for</strong>
                    Start from the shell layer: send chats, inspect memory hits,
                    watch recent tools, and trigger heartbeat or maintenance without
                    leaving the browser.
                </aside>
            </header>

            <div className="layout">
                <section className="stack">
                    <div className="panel section">
                        <div className="section-header">
                            <h2>Overview</h2>
                            <span>{status ? 'Live' : 'Loading'}</span>
                        </div>
                        <div className="stats">
                            <div className="stat-card">
                                <label>Available Agents</label>
                                <strong>{availableAgents.length}</strong>
                            </div>
                            <div className="stat-card">
                                <label>Web Messages</label>
                                <strong>{messages.length}</strong>
                            </div>
                            <div className="stat-card">
                                <label>Scheduled Tasks</label>
                                <strong>{totalTasks}</strong>
                            </div>
                        </div>
                        <div className="hint-strip">
                            <div className="hint">@claude-code fix the failing test</div>
                            <div className="hint">/search --memory release plan</div>
                            <div className="hint">/search incident timeline</div>
                        </div>
                    </div>

                    <div className="panel section">
                        <div className="section-header">
                            <h3>Agents</h3>
                            <span>{status?.server.host ?? '127.0.0.1'}:{status?.server.port ?? 8420}</span>
                        </div>
                        <div className="agent-list">
                            {status?.agents.map((agent) => (
                                <article className="agent-card" key={agent.name}>
                                    <div className="status-line">
                                        <strong>{agent.name}</strong>
                                        <span
                                            className="status-pill"
                                            title={agent.available ? 'available' : 'unavailable'}
                                        >
                                            <span
                                                className="status-dot"
                                                data-tone={agent.available ? 'teal' : 'danger'}
                                            />
                                            {agent.type}
                                        </span>
                                    </div>
                                    <div className="chip-row">
                                        <span
                                            className="chip"
                                            data-tone={agent.available ? 'teal' : 'danger'}
                                        >
                                            {agent.available ? 'available' : 'unavailable'}
                                        </span>
                                        <span className="chip">{agent.enabled ? 'enabled' : 'disabled'}</span>
                                    </div>
                                    <p className="muted">{toolPolicySummary(agent)}</p>
                                </article>
                            )) ?? <div className="empty">Loading agent availability…</div>}
                        </div>
                    </div>

                    <div className="panel section">
                        <div className="section-header">
                            <h3>Scheduler</h3>
                            <span>Heartbeat, cron, maintenance</span>
                        </div>
                        <div className="toolbar">
                            <button
                                className="ghost-btn"
                                onClick={() => void handleTaskRun('/api/heartbeat/run')}
                                type="button"
                            >
                                Run heartbeat
                            </button>
                            <button
                                className="ghost-btn"
                                onClick={() => void handleTaskRun('/api/cron/daily_briefing/run')}
                                type="button"
                            >
                                Run briefing
                            </button>
                            <button
                                className="ghost-btn"
                                onClick={() =>
                                    void handleTaskRun('/api/maintenance/daily_note/run')
                                }
                                type="button"
                            >
                                Daily note
                            </button>
                            <button
                                className="ghost-btn"
                                onClick={() => void handleTaskRun('/api/maintenance/compact/run')}
                                type="button"
                            >
                                Compact memory
                            </button>
                        </div>
                        <div className="task-list">
                            {cronState?.heartbeat ? (
                                <article className="task-card">
                                    <strong>{cronState.heartbeat.name}</strong>
                                    <div className="chip-row">
                                        <span
                                            className="chip"
                                            data-tone={taskTone(cronState.heartbeat.lastResult)}
                                        >
                                            {cronState.heartbeat.lastResult ?? 'never run'}
                                        </span>
                                        <span className="chip">{cronState.heartbeat.schedule}</span>
                                    </div>
                                    <p className="muted">
                                        Last run: {formatTimestamp(cronState.heartbeat.lastRunAt)}
                                    </p>
                                </article>
                            ) : null}

                            {[...(cronState?.cron ?? []), ...(cronState?.maintenance ?? [])].map(
                                (task) => (
                                    <article className="task-card" key={task.id}>
                                        <strong>{task.name}</strong>
                                        <div className="chip-row">
                                            <span
                                                className="chip"
                                                data-tone={taskTone(task.lastResult)}
                                            >
                                                {task.lastResult ?? 'never run'}
                                            </span>
                                            <span className="chip">{task.kind}</span>
                                            <span className="chip">{task.schedule}</span>
                                        </div>
                                        <p className="muted">
                                            Last run: {formatTimestamp(task.lastRunAt)}
                                        </p>
                                    </article>
                                ),
                            )}
                        </div>
                    </div>
                </section>

                <section className="panel chat-shell">
                    <div className="chat-header">
                        <div className="section-header">
                            <h2>Conversation</h2>
                            <span>{status?.homeDir ?? 'Loading home…'}</span>
                        </div>
                        {dashboardError ? (
                            <div className="empty">{dashboardError}</div>
                        ) : (
                            <p>
                                The web channel talks to the same orchestrator, memory,
                                and lifecycle APIs as every other surface.
                            </p>
                        )}
                    </div>

                    <div className="message-list">
                        {messages.length === 0 ? (
                            <div className="empty">
                                No web messages yet. Send a prompt or use <code>/search</code>.
                            </div>
                        ) : (
                            messages.map((message, index) => (
                                <article
                                    className="message-card"
                                    data-role={message.role}
                                    data-revoked={message.status === 'revoked'}
                                    key={message.id}
                                    style={{ animationDelay: `${Math.min(index * 35, 280)}ms` }}
                                >
                                    <div className="message-top">
                                        <strong>{messageLabel(message)}</strong>
                                        <span>
                                            #{message.id} · {formatTimestamp(message.timestamp)}
                                        </span>
                                    </div>
                                    <p className="message-content">{message.content}</p>
                                    <div className="chip-row">
                                        <span className="chip">{message.channel}/{message.chatId}</span>
                                        {message.runId ? <span className="chip">run {message.runId.slice(0, 8)}</span> : null}
                                        {message.durationMs ? (
                                            <span className="chip">{formatDuration(message.durationMs)}</span>
                                        ) : null}
                                        {message.status === 'revoked' ? (
                                            <span className="chip" data-tone="danger">revoked</span>
                                        ) : null}
                                    </div>

                                    {message.role === 'user' && message.status === 'active' ? (
                                        <>
                                            <div className="message-actions">
                                                <button
                                                    className="quiet-btn"
                                                    onClick={() => {
                                                        setEditingMessageId(message.id);
                                                        setEditingText(message.content);
                                                    }}
                                                    type="button"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    className="ghost-btn"
                                                    onClick={() => void handleResend(message.id)}
                                                    type="button"
                                                >
                                                    Resend
                                                </button>
                                                <button
                                                    className="danger-btn"
                                                    onClick={() => void handleRevoke(message.id)}
                                                    type="button"
                                                >
                                                    Revoke
                                                </button>
                                            </div>
                                            {editingMessageId === message.id ? (
                                                <div className="inline-editor">
                                                    <textarea
                                                        value={editingText}
                                                        onChange={(event) =>
                                                            setEditingText(event.target.value)
                                                        }
                                                    />
                                                    <div className="inline-actions">
                                                        <button
                                                            className="btn"
                                                            onClick={() =>
                                                                void handleEditSave(message.id)
                                                            }
                                                            type="button"
                                                        >
                                                            Save edit
                                                        </button>
                                                        <button
                                                            className="ghost-btn"
                                                            onClick={() => {
                                                                setEditingMessageId(null);
                                                                setEditingText('');
                                                            }}
                                                            type="button"
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : null}
                                        </>
                                    ) : null}
                                </article>
                            ))
                        )}
                    </div>

                    <div className="composer">
                        <div className="composer-card">
                            {actionError ? <div className="empty">{actionError}</div> : null}
                            <textarea
                                placeholder="Ask a coding agent, or use /search to hit WillClaw memory directly."
                                value={composerText}
                                onChange={(event) => setComposerText(event.target.value)}
                            />
                            <div className="composer-actions">
                                <select
                                    value={executionMode}
                                    onChange={(event) =>
                                        setExecutionMode(
                                            event.target.value as 'foreground' | 'background',
                                        )
                                    }
                                >
                                    <option value="foreground">foreground</option>
                                    <option value="background">background</option>
                                </select>
                                <button
                                    className="btn"
                                    disabled={submitting}
                                    onClick={() => void handleSend()}
                                    type="button"
                                >
                                    {submitting ? 'Running…' : 'Send'}
                                </button>
                                <button
                                    className="ghost-btn"
                                    onClick={() => setComposerText('/search ')}
                                    type="button"
                                >
                                    Start search
                                </button>
                                <button
                                    className="ghost-btn"
                                    onClick={() => setComposerText('@claude-code ')}
                                    type="button"
                                >
                                    Target Claude
                                </button>
                            </div>
                            {lastRun ? (
                                <div className="hint-strip">
                                    <div className="hint">
                                        Last run via {lastRun.agent} · {formatDuration(lastRun.duration)}
                                    </div>
                                    <div className="hint">run {lastRun.runId.slice(0, 8)}</div>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </section>

                <section className="stack">
                    <div className="panel section">
                        <div className="section-header">
                            <h3>Memory Search</h3>
                            <span>Messages, MEMORY.md, daily notes</span>
                        </div>
                        <div className="search-card">
                            <div className="search-grid">
                                <input
                                    placeholder="Search memory and notes…"
                                    value={searchQuery}
                                    onChange={(event) => setSearchQuery(event.target.value)}
                                />
                                <select
                                    value={searchScope}
                                    onChange={(event) =>
                                        setSearchScope(event.target.value as SearchScope)
                                    }
                                >
                                    <option value="all">all</option>
                                    <option value="messages">messages</option>
                                    <option value="files">files</option>
                                    <option value="memory">MEMORY.md</option>
                                    <option value="daily_note">daily notes</option>
                                </select>
                            </div>
                            {searchLoading ? (
                                <div className="empty">Searching…</div>
                            ) : null}
                            <div className="search-results">
                                {searchResults &&
                                searchResults.messages.length === 0 &&
                                searchResults.files.length === 0 ? (
                                    <div className="empty">No matches yet.</div>
                                ) : null}
                                {searchResults?.messages.map((entry) => (
                                    <article className="result-card" key={`m-${entry.id}`}>
                                        <strong>
                                            Message #{entry.id} · {entry.channel}/{entry.chatId}
                                        </strong>
                                        <p className="result-snippet">{entry.snippet}</p>
                                        <div className="chip-row">
                                            <span className="chip">{entry.role}</span>
                                            <span className="chip">{formatTimestamp(entry.timestamp)}</span>
                                        </div>
                                    </article>
                                ))}
                                {searchResults?.files.map((entry) => (
                                    <article className="result-card" key={`f-${entry.id}`}>
                                        <strong>{entry.filepath}</strong>
                                        <p className="result-snippet">{entry.snippet}</p>
                                        <div className="chip-row">
                                            <span className="chip">{entry.fileType}</span>
                                            <span className="chip">{formatTimestamp(entry.updatedAt)}</span>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="panel section">
                        <div className="section-header">
                            <h3>Host Tools</h3>
                            <span>What WillClaw owns itself</span>
                        </div>
                        <div className="tool-list">
                            {status?.hostTools.map((tool) => (
                                <article className="tool-card" key={tool.name}>
                                    <strong>{tool.label}</strong>
                                    <div className="chip-row">
                                        <span
                                            className="chip"
                                            data-tone={tool.globalEnabled ? 'teal' : 'danger'}
                                        >
                                            {tool.globalEnabled ? 'enabled' : 'disabled'}
                                        </span>
                                        <span className="chip">{tool.category}</span>
                                        {tool.mode ? <span className="chip">{tool.mode}</span> : null}
                                    </div>
                                    <p className="muted">
                                        {tool.preferredProvider
                                            ? `${tool.preferredProvider}${tool.fallbackProvider ? ` -> ${tool.fallbackProvider}` : ''}`
                                            : 'No provider chain'}
                                    </p>
                                </article>
                            )) ?? <div className="empty">Loading host tools…</div>}
                        </div>
                    </div>

                    <div className="panel section">
                        <div className="section-header">
                            <h3>Recent Tool Logs</h3>
                            <span>{toolLogs.length} entries</span>
                        </div>
                        <div className="log-list">
                            {toolLogs.length === 0 ? (
                                <div className="empty">No recent tool logs.</div>
                            ) : (
                                toolLogs.map((entry) => (
                                    <article className="log-card" key={entry.id}>
                                        <strong>
                                            {entry.tool}.{entry.action}
                                        </strong>
                                        <p className="log-snippet">
                                            {entry.output ?? entry.error ?? entry.input}
                                        </p>
                                        <div className="chip-row">
                                            <span
                                                className="chip"
                                                data-tone={entry.success ? 'teal' : 'danger'}
                                            >
                                                {entry.success ? 'ok' : 'failed'}
                                            </span>
                                            <span className="chip">{entry.agent}</span>
                                            <span className="chip">{formatDuration(entry.durationMs)}</span>
                                        </div>
                                    </article>
                                ))
                            )}
                        </div>
                    </div>
                </section>
            </div>
        </main>
    );
}
