import { startTransition, useDeferredValue, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type MessageRole = 'user' | 'assistant' | 'system';
type SchedulerResult = 'completed' | 'failed' | 'suppressed';
type SearchScope = 'all' | 'messages' | 'files' | 'memory' | 'daily_note';
type InspectorTab = 'search' | 'activity' | 'runtime';

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

interface ProviderActionHealth {
    action: string;
    available: boolean;
    healthy: boolean;
    detail: string;
}

interface ProviderHealthEntry {
    tool: 'browser' | 'screen';
    provider: string;
    configured: boolean;
    available: boolean;
    healthy: boolean;
    detail: string;
    installHint?: string;
    actions: ProviderActionHealth[];
}

interface PairingInvite {
    id: string;
    kind: 'web' | 'channel';
    codePreview: string;
    createdAt: string;
    expiresAt: string;
    maxUses: number;
    usedCount: number;
    scopes: string[];
    channels: Array<'telegram' | 'discord' | 'feishu'>;
    createdBy: string;
    revokedAt?: string;
    active: boolean;
}

interface PairingGrant {
    id: string;
    channel: 'telegram' | 'discord' | 'feishu';
    userId: string;
    inviteId: string;
    createdAt: string;
}

interface PairingPayload {
    enabled: boolean;
    invites: PairingInvite[];
    grants: PairingGrant[];
}

interface CreatedPairingInvite {
    id: string;
    code: string;
    kind: 'web' | 'channel';
    createdAt: string;
    expiresAt: string;
    maxUses: number;
    scopes: string[];
    channels: Array<'telegram' | 'discord' | 'feishu'>;
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

interface AuthStatusPayload {
    authRequired: boolean;
    authenticated: boolean;
    sessionCookieName: string;
    scopes: string[];
    pairingEnabled?: boolean;
    tokenId?: string;
    source?: 'bearer' | 'session';
    expiresAt?: string;
}

interface ChatSummary {
    channel: string;
    chatId: string;
    updatedAt: string;
    messageCount: number;
    preview: string;
    role: MessageRole;
    agent?: string;
    runId?: string;
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
    metadata?: Record<string, unknown>;
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

interface QueueRunSummary {
    runId: string;
    channel: string;
    chatId: string;
    userId: string;
    userMessageId: number;
    status: 'queued' | 'running';
    position: number;
    ahead: number;
}

interface QueueSummary {
    channel: string;
    chatId: string;
    total: number;
    queued: number;
    running: number;
    runs: QueueRunSummary[];
}

interface RealtimeEvent {
    id: string;
    type: string;
    timestamp: string;
    payload: Record<string, unknown>;
}

interface ActiveRun {
    runId: string;
    channel: string;
    chatId: string;
    startedAt: string;
    status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
    phase: string;
    agent?: string;
    executionMode?: string;
    explicitAgent?: string;
    fallbackChain?: string[];
    reason?: string;
    latestError?: string;
    streamContent?: string;
    streamParser?: string;
    streamUpdatedAt?: string;
}

interface RoutePlan {
    text: string;
    strippedText: string;
    selectedAgent: string;
    explicitAgent?: string;
    fallbackChain: string[];
    allowFallback: boolean;
    reason: 'explicit' | 'long_context' | 'coding' | 'simple_qa';
    looksLikeCoding: boolean;
    looksLikeLongContext: boolean;
    looksLikeMutating: boolean;
}

interface AssistantRouteMetadata {
    selectedAgent?: string;
    explicitAgent?: string;
    fallbackChain: string[];
    reason?: string;
    attemptedAgents: string[];
}

const WEB_CHANNEL = 'web';
const DEFAULT_CHAT = 'default';
const WEB_USER = 'web-ui';

function collapseWhitespace(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function stripMarkdown(value: string): string {
    return collapseWhitespace(value.replace(/[`*_>#~-]+/g, ' '));
}

function summarizeText(value: string, limit = 92): string {
    const normalized = stripMarkdown(value);
    if (normalized.length <= limit) {
        return normalized;
    }

    return `${normalized.slice(0, Math.max(0, limit - 1)).trim()}…`;
}

function createDraftChatId(): string {
    return `chat-${Date.now().toString(36)}`;
}

function formatTimestamp(value?: string): string {
    if (!value) {
        return 'Pending';
    }

    return new Date(value).toLocaleString();
}

function formatRelativeTime(value?: string): string {
    if (!value) {
        return 'new';
    }

    const deltaMs = new Date(value).getTime() - Date.now();
    const deltaMinutes = Math.round(deltaMs / 60_000);
    const formatter = new Intl.RelativeTimeFormat(undefined, {
        numeric: 'auto',
    });

    if (Math.abs(deltaMinutes) < 1) {
        return 'just now';
    }

    if (Math.abs(deltaMinutes) < 60) {
        return formatter.format(deltaMinutes, 'minute');
    }

    const deltaHours = Math.round(deltaMinutes / 60);
    if (Math.abs(deltaHours) < 24) {
        return formatter.format(deltaHours, 'hour');
    }

    const deltaDays = Math.round(deltaHours / 24);
    return formatter.format(deltaDays, 'day');
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

function formatStructuredResult(value: unknown): string {
    if (typeof value === 'string') {
        return value;
    }

    return JSON.stringify(value, null, 2);
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

function buildEditedSuccessorMap(messages: StoredMessage[]): Map<number, StoredMessage> {
    const map = new Map<number, StoredMessage>();

    for (const message of messages) {
        if (message.editOf != null) {
            map.set(message.editOf, message);
        }
    }

    return map;
}

function describeMessageLineage(
    message: StoredMessage,
    editedSuccessor: StoredMessage | null,
): string | null {
    if (message.editOf != null && editedSuccessor) {
        return `This message replaces #${message.editOf} and was later superseded by #${editedSuccessor.id}.`;
    }

    if (message.editOf != null) {
        return `This message replaces #${message.editOf}.`;
    }

    if (editedSuccessor) {
        return `This message was superseded by edited message #${editedSuccessor.id}.`;
    }

    if (message.status === 'revoked') {
        return 'This message was revoked.';
    }

    return null;
}

function conversationTitle(chat: ChatSummary | null, fallbackChatId: string): string {
    const preview = chat ? summarizeText(chat.preview, 42) : '';
    if (preview) {
        return preview;
    }

    if (fallbackChatId === DEFAULT_CHAT) {
        return 'General shell';
    }

    return `Conversation ${fallbackChatId.slice(0, 8)}`;
}

function conversationSubtitle(chat: ChatSummary | null): string {
    if (!chat) {
        return 'Fresh conversation. Route a prompt to any coding agent shell-side.';
    }

    const preview = summarizeText(chat.preview, 120);
    if (preview) {
        return preview;
    }

    return `${chat.messageCount} messages in this thread`;
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

function readPayloadString(
    payload: Record<string, unknown>,
    key: string,
): string | undefined {
    const value = payload[key];
    return typeof value === 'string' ? value : undefined;
}

function readPayloadStringArray(
    payload: Record<string, unknown>,
    key: string,
): string[] | undefined {
    const value = payload[key];
    if (!Array.isArray(value)) {
        return undefined;
    }

    return value.filter((entry): entry is string => typeof entry === 'string');
}

function cleanSnippet(value: string): string {
    return collapseWhitespace(value.replace(/\[|\]/g, ''));
}

function upsertActiveRun(current: ActiveRun[], incoming: ActiveRun): ActiveRun[] {
    const next = current.filter((entry) => entry.runId !== incoming.runId);
    next.unshift(incoming);
    return next.slice(0, 8);
}

function isSearchCommand(text: string): boolean {
    return text.trim().startsWith('/search');
}

function routeReasonLabel(reason?: RoutePlan['reason'] | string): string {
    switch (reason) {
        case 'explicit':
            return 'explicit target';
        case 'long_context':
            return 'long context';
        case 'coding':
            return 'coding intent';
        case 'simple_qa':
            return 'simple qa';
        default:
            return 'route';
    }
}

function extractAssistantRouteMetadata(
    message: StoredMessage,
): AssistantRouteMetadata | null {
    if (!message.metadata) {
        return null;
    }

    const attemptedAgents = Array.isArray(message.metadata.attemptedAgents)
        ? message.metadata.attemptedAgents.filter(
            (entry): entry is string => typeof entry === 'string',
        )
        : [];
    const routeValue = message.metadata.route;
    const route =
        routeValue && typeof routeValue === 'object' && !Array.isArray(routeValue)
            ? (routeValue as Record<string, unknown>)
            : null;

    if (!route && attemptedAgents.length === 0) {
        return null;
    }

    return {
        ...(route && typeof route.selectedAgent === 'string'
            ? { selectedAgent: route.selectedAgent }
            : {}),
        ...(route && typeof route.explicitAgent === 'string'
            ? { explicitAgent: route.explicitAgent }
            : {}),
        fallbackChain:
            route && Array.isArray(route.fallbackChain)
                ? route.fallbackChain.filter(
                    (entry): entry is string => typeof entry === 'string',
                )
                : [],
        ...(route && typeof route.reason === 'string'
            ? { reason: route.reason }
            : {}),
        attemptedAgents,
    };
}

function describeRealtimeEvent(event: RealtimeEvent): {
    title: string;
    detail: string;
} {
    switch (event.type) {
        case 'chat.run.stream.delta': {
            const agent = readPayloadString(event.payload, 'agent');
            const parser = readPayloadString(event.payload, 'parser');
            return {
                title: `Streaming${agent ? ` · ${agent}` : ''}`,
                detail: parser ? `parser ${parser}` : 'Live output update',
            };
        }
        case 'chat.route.selected': {
            const selectedAgent = readPayloadString(event.payload, 'selectedAgent');
            const reason = readPayloadString(event.payload, 'reason');
            return {
                title: `Route selected${selectedAgent ? ` · ${selectedAgent}` : ''}`,
                detail: routeReasonLabel(reason),
            };
        }
        case 'chat.agent.started': {
            const agent = readPayloadString(event.payload, 'agent');
            return {
                title: `Agent started${agent ? ` · ${agent}` : ''}`,
                detail: 'Execution launched',
            };
        }
        case 'chat.agent.failed': {
            const agent = readPayloadString(event.payload, 'agent');
            return {
                title: `Agent failed${agent ? ` · ${agent}` : ''}`,
                detail: readPayloadString(event.payload, 'error') ?? 'Attempt failed',
            };
        }
        case 'chat.agent.skipped': {
            const agent = readPayloadString(event.payload, 'agent');
            return {
                title: `Agent skipped${agent ? ` · ${agent}` : ''}`,
                detail: readPayloadString(event.payload, 'reason') ?? 'Skipped',
            };
        }
        case 'chat.run.started':
            return {
                title: 'Run started',
                detail: readPayloadString(event.payload, 'executionMode') ?? 'foreground',
            };
        case 'chat.run.queued': {
            const ahead = event.payload.ahead;
            return {
                title: 'Run queued',
                detail:
                    typeof ahead === 'number' && Number.isFinite(ahead)
                        ? `${ahead} ahead`
                        : 'Waiting for earlier work',
            };
        }
        case 'chat.run.completed':
            return {
                title: 'Run completed',
                detail: readPayloadString(event.payload, 'agent') ?? 'completed',
            };
        case 'chat.run.failed':
            return {
                title: 'Run failed',
                detail: readPayloadString(event.payload, 'error') ?? 'Unknown failure',
            };
        case 'chat.run.cancelled':
            return {
                title: 'Run cancelled',
                detail: readPayloadString(event.payload, 'error') ?? 'Cancelled',
            };
        case 'message.created':
            return {
                title: 'Message saved',
                detail: readPayloadString(event.payload, 'role') ?? 'message',
            };
        case 'message.revoked':
            return {
                title: 'Message revoked',
                detail: readPayloadString(event.payload, 'subtype') ?? 'revoked',
            };
        default:
            return {
                title: event.type,
                detail: formatTimestamp(event.timestamp),
            };
    }
}

function shouldTrackRecentEvent(eventType: string): boolean {
    return eventType !== 'chat.run.stream.delta';
}

async function readJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
    const response = await fetch(input, {
        credentials: 'same-origin',
        ...init,
    });
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

function MessageBody({ message }: { message: StoredMessage }) {
    if (message.role === 'user') {
        return (
            <div className="message-content message-content--plain">
                {message.content}
            </div>
        );
    }

    return (
        <div className="message-content message-content--markdown">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    a: ({ ...props }) => <a {...props} rel="noreferrer" target="_blank" />,
                }}
            >
                {message.content}
            </ReactMarkdown>
        </div>
    );
}

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
    const [pairingState, setPairingState] = useState<PairingPayload | null>(null);
    const [pairingBusy, setPairingBusy] = useState(false);
    const [pairingKind, setPairingKind] = useState<'web' | 'channel'>('web');
    const [pairingChannel, setPairingChannel] = useState<'telegram' | 'discord' | 'feishu'>('telegram');
    const [pairingInvite, setPairingInvite] = useState<CreatedPairingInvite | null>(null);
    const [browserTarget, setBrowserTarget] = useState('https://example.com');
    const [screenApp, setScreenApp] = useState('');
    const [hostActionBusy, setHostActionBusy] = useState(false);
    const [hostActionResult, setHostActionResult] = useState('');

    const deferredSearchQuery = useDeferredValue(searchQuery.trim());
    const deferredComposerText = useDeferredValue(composerText.trim());

    const authReady = authStatus !== null;
    const authAllowsDashboard =
        authReady && (!authStatus.authRequired || authStatus.authenticated);

    async function loadAuthStatus(): Promise<AuthStatusPayload> {
        const payload = await readJson<AuthStatusPayload>('/api/auth/status');
        startTransition(() => {
            setAuthStatus(payload);
        });
        return payload;
    }

    async function loadStatusPanel(): Promise<void> {
        const payload = await readJson<StatusPayload>('/api/status');
        startTransition(() => {
            setStatus(payload);
        });
    }

    async function loadProviderHealthPanel(): Promise<void> {
        const payload = await readJson<ProviderHealthEntry[]>(
            '/api/providers/health',
        );
        startTransition(() => {
            setProviderHealth(payload);
        });
    }

    async function loadPairingPanel(): Promise<void> {
        const payload = await readJson<PairingPayload>('/api/pairing');
        startTransition(() => {
            setPairingState(payload);
        });
    }

    async function loadChatList(): Promise<void> {
        const currentDraftId = draftChatId;
        const payload = await readJson<ChatSummary[]>(
            `/api/chats?channel=${WEB_CHANNEL}&limit=24`,
        );
        const chatIds = new Set(payload.map((chat) => chat.chatId));

        startTransition(() => {
            setChats(payload);
            setDraftChatId((current) =>
                current && chatIds.has(current) ? null : current,
            );
            setSelectedChatId((current) => {
                if (chatIds.has(current) || current === currentDraftId) {
                    return current;
                }

                return payload[0]?.chatId ?? current;
            });
        });
    }

    async function loadMessagesPanel(chatId = selectedChatId): Promise<void> {
        const params = new URLSearchParams({
            channel: WEB_CHANNEL,
            chatId,
            limit: '120',
            includeRevoked: 'true',
        });
        const payload = await readJson<StoredMessage[]>(
            `/api/messages?${params.toString()}`,
        );
        startTransition(() => {
            setMessages(payload);
        });
    }

    async function loadToolLogsPanel(chatId = selectedChatId): Promise<void> {
        const params = new URLSearchParams({
            limit: '16',
            chatId,
        });
        const payload = await readJson<ToolLogEntry[]>(
            `/api/logs/tools?${params.toString()}`,
        );
        startTransition(() => {
            setToolLogs(payload);
        });
    }

    async function loadSchedulerPanel(): Promise<void> {
        const payload = await readJson<CronPayload>('/api/cron');
        startTransition(() => {
            setCronState(payload);
        });
    }

    async function loadQueuePanel(): Promise<void> {
        const payload = await readJson<QueueSummary[]>(
            `/api/queues?channel=${WEB_CHANNEL}`,
        );
        startTransition(() => {
            setQueueSummaries(payload);
        });
    }

    async function loadShellPanels(): Promise<void> {
        try {
            await Promise.all([
                loadStatusPanel(),
                loadProviderHealthPanel(),
                loadPairingPanel(),
                loadChatList(),
                loadSchedulerPanel(),
                loadQueuePanel(),
            ]);
            setDashboardError('');
        } catch (error) {
            setDashboardError(
                error instanceof Error ? error.message : 'Failed to load shell data.',
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
                    searchScope === 'files' ||
                    searchScope === 'memory' ||
                    searchScope === 'daily_note'
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

    async function loadRoutePreview(text: string): Promise<void> {
        if (!text || isSearchCommand(text)) {
            setRoutePreview(null);
            return;
        }

        try {
            const params = new URLSearchParams({ text });
            const payload = await readJson<RoutePlan>(
                `/api/route-preview?${params.toString()}`,
            );
            startTransition(() => {
                setRoutePreview(payload);
            });
        } catch {
            setRoutePreview(null);
        }
    }

    async function handleAuthLogin(): Promise<void> {
        const credential = authTokenInput.trim();
        if (!credential) {
            setDashboardError('Enter a bearer token or pairing code to unlock the shell.');
            return;
        }

        setAuthBusy(true);
        setDashboardError('');

        try {
            let payload: AuthStatusPayload;

            try {
                payload = await readJson<AuthStatusPayload>('/api/auth/session', {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                    },
                    body: JSON.stringify({ token: credential }),
                });
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : 'Unlock failed.';
                if (!message.toLowerCase().includes('unauthorized')) {
                    throw error;
                }

                payload = await readJson<AuthStatusPayload>('/api/auth/pairing', {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                    },
                    body: JSON.stringify({ code: credential }),
                });
            }
            startTransition(() => {
                setAuthStatus(payload);
                setAuthTokenInput('');
                setRealtimeConnected(false);
                setRecentEvents([]);
                setActiveRuns([]);
            });
            await Promise.all([
                loadShellPanels(),
                loadMessagesPanel(selectedChatId),
                loadToolLogsPanel(selectedChatId),
            ]);
        } catch (error) {
            setDashboardError(
                error instanceof Error
                    ? error.message
                    : 'Login failed with the provided token.',
            );
        } finally {
            setAuthBusy(false);
        }
    }

    async function handleAuthLogout(): Promise<void> {
        setAuthBusy(true);

        try {
            const payload = await readJson<AuthStatusPayload>('/api/auth/session', {
                method: 'DELETE',
            });
            startTransition(() => {
                setAuthStatus(payload);
                setRealtimeConnected(false);
                setRecentEvents([]);
                setActiveRuns([]);
                setMessages([]);
                setToolLogs([]);
            });
        } catch (error) {
            setDashboardError(
                error instanceof Error ? error.message : 'Logout failed.',
            );
        } finally {
            setAuthBusy(false);
        }
    }

    async function handleCreatePairingInvite(): Promise<void> {
        setPairingBusy(true);
        setActionError('');

        try {
            const payload = await readJson<CreatedPairingInvite>('/api/pairing/invites', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    kind: pairingKind,
                    ...(pairingKind === 'channel'
                        ? { channels: [pairingChannel] }
                        : {}),
                }),
            });
            startTransition(() => {
                setPairingInvite(payload);
            });
            await loadPairingPanel();
        } catch (error) {
            setActionError(
                error instanceof Error
                    ? error.message
                    : 'Failed to create pairing invite.',
            );
        } finally {
            setPairingBusy(false);
        }
    }

    async function handleRevokePairingInvite(inviteId: string): Promise<void> {
        setPairingBusy(true);
        setActionError('');

        try {
            await readJson<PairingInvite>(`/api/pairing/invites/${inviteId}/revoke`, {
                method: 'POST',
            });
            if (pairingInvite?.id === inviteId) {
                startTransition(() => {
                    setPairingInvite(null);
                });
            }
            await loadPairingPanel();
        } catch (error) {
            setActionError(
                error instanceof Error
                    ? error.message
                    : 'Failed to revoke pairing invite.',
            );
        } finally {
            setPairingBusy(false);
        }
    }

    async function handleRevokePairingGrant(grantId: string): Promise<void> {
        setPairingBusy(true);
        setActionError('');

        try {
            await readJson<PairingGrant>(`/api/pairing/grants/${grantId}/revoke`, {
                method: 'POST',
            });
            await loadPairingPanel();
        } catch (error) {
            setActionError(
                error instanceof Error
                    ? error.message
                    : 'Failed to revoke pairing grant.',
            );
        } finally {
            setPairingBusy(false);
        }
    }

    useEffect(() => {
        let cancelled = false;

        const boot = async () => {
            try {
                const payload = await loadAuthStatus();
                if (
                    cancelled ||
                    (payload.authRequired && !payload.authenticated)
                ) {
                    return;
                }

                await loadShellPanels();
            } catch (error) {
                if (!cancelled) {
                    setDashboardError(
                        error instanceof Error
                            ? error.message
                            : 'Failed to load shell data.',
                    );
                }
            }
        };

        void boot();

        const interval = window.setInterval(() => {
            void loadAuthStatus()
                .then((payload) => {
                    if (!payload.authRequired || payload.authenticated) {
                        return loadShellPanels();
                    }

                    return undefined;
                })
                .catch((error) => {
                    setDashboardError(
                        error instanceof Error
                            ? error.message
                            : 'Failed to load shell data.',
                    );
                });
        }, 30_000);

        return () => {
            cancelled = true;
            window.clearInterval(interval);
        };
    }, []);

    useEffect(() => {
        if (!authAllowsDashboard) {
            return;
        }

        void loadMessagesPanel(selectedChatId);
        void loadToolLogsPanel(selectedChatId);

        const interval = window.setInterval(() => {
            void loadMessagesPanel(selectedChatId);
            void loadToolLogsPanel(selectedChatId);
        }, 30_000);

        return () => {
            window.clearInterval(interval);
        };
    }, [authAllowsDashboard, selectedChatId]);

    useEffect(() => {
        if (!authAllowsDashboard) {
            setRealtimeConnected(false);
            return;
        }

        const source = new EventSource('/api/events');
        const eventTypes = [
            'ready',
            'chat.run.queued',
            'chat.run.started',
            'chat.run.stream.delta',
            'chat.run.completed',
            'chat.run.failed',
            'chat.run.cancelled',
            'chat.route.selected',
            'chat.agent.started',
            'chat.agent.failed',
            'chat.agent.skipped',
            'message.created',
            'message.revoked',
            'background.task.started',
            'background.task.completed',
            'background.task.failed',
            'scheduler.task.started',
            'scheduler.task.completed',
            'scheduler.task.failed',
        ] as const;

        const handleEvent = (nativeEvent: Event) => {
            const messageEvent = nativeEvent as MessageEvent<string>;

            try {
                const event = JSON.parse(messageEvent.data) as RealtimeEvent;
                if (shouldTrackRecentEvent(event.type)) {
                    setRecentEvents((current) => [event, ...current].slice(0, 12));
                }

                switch (event.type) {
                    case 'ready':
                        setRealtimeConnected(true);
                        break;
                    case 'chat.run.queued': {
                        const runId = readPayloadString(event.payload, 'runId');
                        const channel = readPayloadString(event.payload, 'channel');
                        const chatId = readPayloadString(event.payload, 'chatId');
                        const executionMode = readPayloadString(
                            event.payload,
                            'executionMode',
                        );
                        const ahead = event.payload.ahead;
                        if (!runId || !channel || !chatId) {
                            break;
                        }

                        setActiveRuns((current) =>
                            upsertActiveRun(current, {
                                runId,
                                channel,
                                chatId,
                                startedAt: event.timestamp,
                                status: 'queued',
                                phase:
                                    typeof ahead === 'number' &&
                                    Number.isFinite(ahead)
                                        ? `queued · ${ahead} ahead`
                                        : 'queued',
                                streamContent: '',
                                ...(executionMode ? { executionMode } : {}),
                            }),
                        );

                        if (channel === WEB_CHANNEL) {
                            void loadChatList();
                            void loadQueuePanel();
                            if (chatId === selectedChatId) {
                                void loadMessagesPanel(chatId);
                            }
                        }
                        break;
                    }
                    case 'chat.run.started': {
                        const runId = readPayloadString(event.payload, 'runId');
                        const channel = readPayloadString(event.payload, 'channel');
                        const chatId = readPayloadString(event.payload, 'chatId');
                        const executionMode = readPayloadString(
                            event.payload,
                            'executionMode',
                        );
                        if (!runId || !channel || !chatId) {
                            break;
                        }

                        setActiveRuns((current) =>
                            upsertActiveRun(current, {
                                runId,
                                channel,
                                chatId,
                                startedAt: event.timestamp,
                                status: 'running',
                                phase: 'running',
                                streamContent: '',
                                ...(executionMode ? { executionMode } : {}),
                            }),
                        );

                        if (channel === WEB_CHANNEL) {
                            void loadChatList();
                            void loadQueuePanel();
                            if (chatId === selectedChatId) {
                                void loadMessagesPanel(chatId);
                            }
                        }
                        break;
                    }
                    case 'chat.route.selected': {
                        const runId = readPayloadString(event.payload, 'runId');
                        const selectedAgent = readPayloadString(
                            event.payload,
                            'selectedAgent',
                        );
                        if (!runId) {
                            break;
                        }

                        setActiveRuns((current) => {
                            const existing = current.find(
                                (entry) => entry.runId === runId,
                            );
                            if (!existing) {
                                return current;
                            }

                            return upsertActiveRun(current, {
                                ...existing,
                                ...(selectedAgent ? { agent: selectedAgent } : {}),
                                ...(() => {
                                    const reason = readPayloadString(
                                        event.payload,
                                        'reason',
                                    );
                                    return reason ? { reason } : {};
                                })(),
                                ...(() => {
                                    const explicitAgent = readPayloadString(
                                        event.payload,
                                        'explicitAgent',
                                    );
                                    return explicitAgent ? { explicitAgent } : {};
                                })(),
                                ...(() => {
                                    const fallbackChain = readPayloadStringArray(
                                        event.payload,
                                        'fallbackChain',
                                    );
                                    return fallbackChain
                                        ? { fallbackChain }
                                        : {};
                                })(),
                                phase: selectedAgent
                                    ? `routing → ${selectedAgent}`
                                    : 'routing',
                            });
                        });
                        break;
                    }
                    case 'chat.agent.started': {
                        const runId = readPayloadString(event.payload, 'runId');
                        const agent = readPayloadString(event.payload, 'agent');
                        if (!runId) {
                            break;
                        }

                        setActiveRuns((current) => {
                            const existing = current.find(
                                (entry) => entry.runId === runId,
                            );
                            if (!existing) {
                                return current;
                            }

                            return upsertActiveRun(current, {
                                ...existing,
                                ...(agent ? { agent } : {}),
                                phase: agent ? `running ${agent}` : 'running',
                                streamContent: '',
                            });
                        });
                        break;
                    }
                    case 'chat.run.stream.delta': {
                        const runId = readPayloadString(event.payload, 'runId');
                        const agent = readPayloadString(event.payload, 'agent');
                        const channel = readPayloadString(event.payload, 'channel');
                        const chatId = readPayloadString(event.payload, 'chatId');
                        const content = readPayloadString(event.payload, 'content');
                        const parser = readPayloadString(event.payload, 'parser');
                        if (!runId || !channel || !chatId || !content) {
                            break;
                        }

                        setActiveRuns((current) => {
                            const existing = current.find(
                                (entry) => entry.runId === runId,
                            );
                            if (!existing) {
                                return current;
                            }

                            return upsertActiveRun(current, {
                                ...existing,
                                ...(agent ? { agent } : {}),
                                streamContent: content,
                                ...(parser ? { streamParser: parser } : {}),
                                streamUpdatedAt: event.timestamp,
                                phase: agent ? `streaming ${agent}` : 'streaming',
                            });
                        });
                        break;
                    }
                    case 'chat.agent.failed':
                    case 'chat.agent.skipped': {
                        const runId = readPayloadString(event.payload, 'runId');
                        const agent = readPayloadString(event.payload, 'agent');
                        const detail =
                            readPayloadString(event.payload, 'error') ??
                            readPayloadString(event.payload, 'reason');
                        if (!runId) {
                            break;
                        }

                        setActiveRuns((current) => {
                            const existing = current.find(
                                (entry) => entry.runId === runId,
                            );
                            if (!existing) {
                                return current;
                            }

                            return upsertActiveRun(current, {
                                ...existing,
                                ...(agent ? { agent } : {}),
                                ...(detail ? { latestError: detail } : {}),
                                phase:
                                    event.type === 'chat.agent.failed'
                                        ? `retrying after ${agent ?? 'agent'}`
                                        : `skipping ${agent ?? 'agent'}`,
                            });
                        });
                        break;
                    }
                    case 'chat.run.completed':
                    case 'chat.run.failed':
                    case 'chat.run.cancelled': {
                        const runId = readPayloadString(event.payload, 'runId');
                        const channel = readPayloadString(event.payload, 'channel');
                        const chatId = readPayloadString(event.payload, 'chatId');

                        if (runId) {
                            setActiveRuns((current) =>
                                current.filter((entry) => entry.runId !== runId),
                            );
                        }

                        if (channel === WEB_CHANNEL) {
                            void loadChatList();
                            void loadQueuePanel();
                        }

                        if (channel === WEB_CHANNEL && chatId === selectedChatId) {
                            void loadMessagesPanel(chatId);
                            void loadToolLogsPanel(chatId);
                        }
                        break;
                    }
                    case 'message.created':
                    case 'message.revoked': {
                        const channel = readPayloadString(event.payload, 'channel');
                        const chatId = readPayloadString(event.payload, 'chatId');

                        if (channel === WEB_CHANNEL) {
                            void loadChatList();
                            void loadQueuePanel();
                        }

                        if (channel === WEB_CHANNEL && chatId === selectedChatId) {
                            void loadMessagesPanel(chatId);
                            void loadToolLogsPanel(chatId);
                        }
                        break;
                    }
                    case 'background.task.started':
                    case 'background.task.completed':
                    case 'background.task.failed':
                    case 'scheduler.task.started':
                    case 'scheduler.task.completed':
                    case 'scheduler.task.failed':
                        void loadSchedulerPanel();
                        void loadShellPanels();
                        break;
                    default:
                        break;
                }
            } catch {
                setRealtimeConnected(false);
            }
        };

        source.addEventListener('open', () => {
            setRealtimeConnected(true);
        });
        source.addEventListener('error', () => {
            setRealtimeConnected(false);
        });

        for (const eventType of eventTypes) {
            source.addEventListener(eventType, handleEvent);
        }

        return () => {
            for (const eventType of eventTypes) {
                source.removeEventListener(eventType, handleEvent);
            }
            source.close();
            setRealtimeConnected(false);
        };
    }, [authAllowsDashboard, selectedChatId, draftChatId]);

    useEffect(() => {
        if (!authAllowsDashboard) {
            return;
        }

        void loadSearch(deferredSearchQuery);
    }, [authAllowsDashboard, deferredSearchQuery, searchScope]);

    useEffect(() => {
        if (!authAllowsDashboard) {
            return;
        }

        void loadRoutePreview(deferredComposerText);
    }, [authAllowsDashboard, deferredComposerText]);

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
                    chatId: selectedChatId,
                    userId: WEB_USER,
                    executionMode,
                }),
            });

            setLastRun(result);
            setComposerText('');
            await Promise.all([
                loadChatList(),
                loadMessagesPanel(result.chatId),
                loadToolLogsPanel(result.chatId),
            ]);
        } catch (error) {
            setActionError(error instanceof Error ? error.message : 'Chat failed.');
        } finally {
            setSubmitting(false);
        }
    }

    async function handleCancelRun(runId: string): Promise<void> {
        setActionError('');

        try {
            await readJson(`/api/runs/${runId}/cancel`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    annotate: true,
                }),
            });
            await Promise.all([loadMessagesPanel(selectedChatId), loadChatList()]);
        } catch (error) {
            setActionError(
                error instanceof Error ? error.message : 'Cancel request failed.',
            );
        }
    }

    async function handleRevoke(messageId: number): Promise<void> {
        setActionError('');

        try {
            await readJson(`/api/messages/${messageId}/revoke`, {
                method: 'POST',
            });
            await Promise.all([
                loadMessagesPanel(selectedChatId),
                loadChatList(),
                loadToolLogsPanel(selectedChatId),
            ]);
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
                    chatId: selectedChatId,
                    userId: WEB_USER,
                }),
            });
            setLastRun(result);
            await Promise.all([
                loadChatList(),
                loadMessagesPanel(selectedChatId),
                loadToolLogsPanel(selectedChatId),
            ]);
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
            await Promise.all([
                loadChatList(),
                loadMessagesPanel(selectedChatId),
                loadToolLogsPanel(selectedChatId),
            ]);
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
            await Promise.all([loadSchedulerPanel(), loadChatList()]);
        } catch (error) {
            setActionError(
                error instanceof Error ? error.message : 'Task trigger failed.',
            );
        }
    }

    async function runHostAction(
        endpoint: string,
        payload: Record<string, unknown>,
    ): Promise<void> {
        setHostActionBusy(true);
        setActionError('');

        try {
            const result = await readJson<unknown>(endpoint, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                body: JSON.stringify(payload),
            });
            setHostActionResult(formatStructuredResult(result));
            await loadToolLogsPanel(selectedChatId);
        } catch (error) {
            setActionError(
                error instanceof Error ? error.message : 'Host action failed.',
            );
        } finally {
            setHostActionBusy(false);
        }
    }

    function handleCreateChat(): void {
        const draftId = createDraftChatId();
        startTransition(() => {
            setDraftChatId(draftId);
            setSelectedChatId(draftId);
            setMessages([]);
            setLastRun(null);
            setEditingMessageId(null);
            setEditingText('');
            setActionError('');
        });
    }

    function handleSelectChat(chatId: string): void {
        setSelectedChatId(chatId);
        setEditingMessageId(null);
        setEditingText('');
        setActionError('');
    }

    function handleInjectIntoComposer(content: string): void {
        setComposerText((current) =>
            current.trim() ? `${current.trim()}\n\n${content}` : content,
        );
    }

    if (!authReady) {
        return (
            <main className="auth-shell">
                <section className="panel auth-card">
                    <div className="eyebrow">WillClaw Shell</div>
                    <h1>Loading shell access…</h1>
                    <p>
                        Checking whether this workspace requires an authenticated
                        session before the dashboard boots.
                    </p>
                </section>
            </main>
        );
    }

    if (authStatus.authRequired && !authStatus.authenticated) {
        return (
            <main className="auth-shell">
                <section className="panel auth-card">
                    <div className="eyebrow">WillClaw Shell</div>
                    <h1>Unlock the shell</h1>
                    <p>
                        This workspace is protected. Paste a bearer token with
                        `api:session` access
                        {authStatus.pairingEnabled
                            ? ' or a valid pairing code'
                            : ''}
                        {' '}to open the Web UI.
                    </p>
                    <label className="auth-field">
                        <span>
                            {authStatus.pairingEnabled
                                ? 'Bearer token or pairing code'
                                : 'Bearer token'}
                        </span>
                        <input
                            autoComplete="off"
                            onChange={(event) => setAuthTokenInput(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    void handleAuthLogin();
                                }
                            }}
                            placeholder={
                                authStatus.pairingEnabled ? 'wc_xxx... or wc_pair_...' : 'wc_xxx...'
                            }
                            type="password"
                            value={authTokenInput}
                        />
                    </label>
                    <div className="auth-actions">
                        <button
                            className="btn"
                            disabled={authBusy}
                            onClick={() => {
                                void handleAuthLogin();
                            }}
                            type="button"
                        >
                            {authBusy ? 'Unlocking…' : 'Unlock'}
                        </button>
                    </div>
                    {dashboardError ? <p className="error">{dashboardError}</p> : null}
                </section>
            </main>
        );
    }

    const availableAgents = status?.agents.filter((agent) => agent.available) ?? [];
    const totalTasks =
        (cronState?.heartbeat ? 1 : 0) +
        (cronState?.cron.length ?? 0) +
        (cronState?.maintenance.length ?? 0);
    const chatList =
        draftChatId && !chats.some((chat) => chat.chatId === draftChatId)
            ? [
                {
                    channel: WEB_CHANNEL,
                    chatId: draftChatId,
                    updatedAt: new Date().toISOString(),
                    messageCount: 0,
                    preview: 'Fresh conversation',
                    role: 'user' as const,
                },
                ...chats,
            ]
            : chats;
    const selectedChat =
        chatList.find((chat) => chat.chatId === selectedChatId) ?? null;
    const queueSummaryByChatId = new Map(
        queueSummaries.map((summary) => [summary.chatId, summary] as const),
    );
    const editedSuccessorById = buildEditedSuccessorMap(messages);
    const selectedChatQueue = queueSummaryByChatId.get(selectedChatId) ?? null;
    const selectedQueueLeadRun = selectedChatQueue?.runs[0] ?? null;
    const currentActiveRun =
        activeRuns.find(
            (entry) =>
                entry.channel === WEB_CHANNEL && entry.chatId === selectedChatId,
        ) ?? null;
    const latestAssistantRoute =
        [...messages]
            .reverse()
            .map((message) => extractAssistantRouteMetadata(message))
            .find((route): route is AssistantRouteMetadata => Boolean(route)) ??
        null;
    const currentRecentEvents = recentEvents.filter((event) => {
        const eventChannel = readPayloadString(event.payload, 'channel');
        const eventChatId = readPayloadString(event.payload, 'chatId');

        return (
            !eventChannel ||
            eventChannel !== WEB_CHANNEL ||
            eventChatId === selectedChatId
        );
    });
    const schedulerTasks = [
        ...(cronState?.heartbeat ? [cronState.heartbeat] : []),
        ...(cronState?.cron ?? []),
        ...(cronState?.maintenance ?? []),
    ];
    const composerShowsSearch = isSearchCommand(deferredComposerText);

    return (
        <main className="app-shell">
            <header className="panel topbar">
                <div className="brand">
                    <div className="brand-mark">WC</div>
                    <div className="brand-copy">
                        <div className="eyebrow">WillClaw Shell</div>
                        <h1>One conversation. Many coding agents.</h1>
                        <p>
                            Route chats, memory, tools, and background work from
                            one shell-first interface instead of living inside a
                            single agent session.
                        </p>
                    </div>
                </div>
                <div className="status-cluster">
                    <div className="status-card">
                        <label>Realtime</label>
                        <strong>{realtimeConnected ? 'Live' : 'Retrying'}</strong>
                    </div>
                    <div className="status-card">
                        <label>Agents</label>
                        <strong>{availableAgents.length}</strong>
                    </div>
                    <div className="status-card">
                        <label>Threads</label>
                        <strong>{chatList.length}</strong>
                    </div>
                    <div className="status-card">
                        <label>Tasks</label>
                        <strong>{totalTasks}</strong>
                    </div>
                    {authStatus.authRequired ? (
                        <div className="status-card status-card--auth">
                            <label>Auth</label>
                            <strong>{authStatus.tokenId ?? 'session'}</strong>
                            <button
                                className="quiet-btn status-card__action"
                                disabled={authBusy}
                                onClick={() => {
                                    void handleAuthLogout();
                                }}
                                type="button"
                            >
                                {authBusy ? 'Working…' : 'Log out'}
                            </button>
                        </div>
                    ) : null}
                </div>
            </header>

            <div className="workspace-grid">
                <aside className="panel sidebar">
                    <div className="sidebar-section">
                        <div className="section-header">
                            <h2>Conversations</h2>
                            <span>{chatList.length} tracked</span>
                        </div>
                        <button
                            className="btn btn-block"
                            onClick={handleCreateChat}
                            type="button"
                        >
                            New conversation
                        </button>
                        <div className="quick-grid">
                            <button
                                className="quick-btn"
                                onClick={() => setComposerText('/search ')}
                                type="button"
                            >
                                Start search
                            </button>
                            {availableAgents.slice(0, 3).map((agent) => (
                                <button
                                    className="quick-btn"
                                    key={agent.name}
                                    onClick={() =>
                                        setComposerText((current) =>
                                            current.startsWith(`@${agent.name}`)
                                                ? current
                                                : `@${agent.name} ${current}`.trim(),
                                        )
                                    }
                                    type="button"
                                >
                                    @{agent.name}
                                </button>
                            ))}
                        </div>
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
                                        onClick={() => handleSelectChat(chat.chatId)}
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
                            <span>{status?.server.host ?? '127.0.0.1'}</span>
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
                                        latestAssistantRoute?.selectedAgent ??
                                        routePreview?.selectedAgent ??
                                        'shell'}
                                </strong>
                                <p>
                                    {currentActiveRun?.reason
                                        ? routeReasonLabel(currentActiveRun.reason)
                                        : latestAssistantRoute?.reason
                                            ? routeReasonLabel(
                                                latestAssistantRoute.reason,
                                            )
                                            : routePreview
                                                ? routeReasonLabel(
                                                    routePreview.reason,
                                                )
                                                : 'Waiting for next prompt'}
                                </p>
                            </article>
                        </div>
                    </div>
                </aside>

                <section className="panel conversation-shell">
                    <div className="conversation-header">
                        <div className="conversation-copy">
                            <div className="eyebrow">Web channel</div>
                            <h2>{conversationTitle(selectedChat, selectedChatId)}</h2>
                            <p>{conversationSubtitle(selectedChat)}</p>
                        </div>
                        <div className="conversation-status">
                            <span
                                className="chip"
                                data-tone={realtimeConnected ? 'teal' : 'accent'}
                            >
                                {realtimeConnected ? 'live stream' : 'reconnecting'}
                            </span>
                            <span className="chip">{selectedChatId}</span>
                            {selectedChatQueue ? (
                                <span className="chip" data-tone="accent">
                                    queue {selectedChatQueue.total}
                                </span>
                            ) : null}
                            {lastRun?.chatId === selectedChatId ? (
                                <span className="chip" data-tone="teal">
                                    last: {lastRun.agent}
                                </span>
                            ) : null}
                            {currentActiveRun ?? selectedQueueLeadRun ? (
                                <button
                                    className="danger-btn"
                                    onClick={() =>
                                        void handleCancelRun(
                                            currentActiveRun?.runId ??
                                                selectedQueueLeadRun?.runId ??
                                                '',
                                        )
                                    }
                                    type="button"
                                >
                                    Cancel run
                                </button>
                            ) : null}
                        </div>
                    </div>

                    {dashboardError ? (
                        <div className="banner banner--danger">{dashboardError}</div>
                    ) : null}
                    {actionError ? (
                        <div className="banner banner--warning">{actionError}</div>
                    ) : null}

                    <div className="conversation-stream">
                        {messages.length === 0 ? (
                            <div className="empty empty--hero">
                                <strong>Nothing in this thread yet.</strong>
                                <p>
                                    Start with `@claude-code fix the flaky test`, or use
                                    `/search release plan` to hit WillClaw memory without
                                    invoking a coding agent.
                                </p>
                            </div>
                        ) : (
                            messages.map((message, index) => (
                                (() => {
                                    const editedSuccessor =
                                        editedSuccessorById.get(message.id) ?? null;
                                    const lineage = describeMessageLineage(
                                        message,
                                        editedSuccessor,
                                    );

                                    return (
                                        <div
                                            className="message-row"
                                            data-role={message.role}
                                            key={message.id}
                                            style={{
                                                animationDelay: `${Math.min(index * 30, 240)}ms`,
                                            }}
                                        >
                                            <article
                                                className="message-bubble"
                                                data-role={message.role}
                                                data-revoked={message.status === 'revoked'}
                                            >
                                                <div className="message-top">
                                                    <strong>{messageLabel(message)}</strong>
                                                    <span>
                                                        #{message.id} ·{' '}
                                                        {formatTimestamp(message.timestamp)}
                                                    </span>
                                                </div>
                                                <MessageBody message={message} />
                                                <div className="message-footer">
                                                    <div className="chip-row">
                                                        {message.runId ? (
                                                            <span className="chip">
                                                                run {message.runId.slice(0, 8)}
                                                            </span>
                                                        ) : null}
                                                        {message.durationMs ? (
                                                            <span className="chip">
                                                                {formatDuration(message.durationMs)}
                                                            </span>
                                                        ) : null}
                                                        {message.status === 'revoked' ? (
                                                            <span
                                                                className="chip"
                                                                data-tone="danger"
                                                            >
                                                                revoked
                                                            </span>
                                                        ) : null}
                                                        {message.editOf != null ? (
                                                            <span
                                                                className="chip"
                                                                data-tone="accent"
                                                            >
                                                                edited from #{message.editOf}
                                                            </span>
                                                        ) : null}
                                                        {editedSuccessor ? (
                                                            <span
                                                                className="chip"
                                                                data-tone="accent"
                                                            >
                                                                superseded by #
                                                                {editedSuccessor.id}
                                                            </span>
                                                        ) : null}
                                                        {(() => {
                                                            const route = extractAssistantRouteMetadata(
                                                                message,
                                                            );
                                                            if (!route) {
                                                                return null;
                                                            }

                                                            return (
                                                                <>
                                                                    {route.selectedAgent ? (
                                                                        <span
                                                                            className="chip"
                                                                            data-tone="teal"
                                                                        >
                                                                            route {route.selectedAgent}
                                                                        </span>
                                                                    ) : null}
                                                                    {route.reason ? (
                                                                        <span className="chip">
                                                                            {routeReasonLabel(
                                                                                route.reason,
                                                                            )}
                                                                        </span>
                                                                    ) : null}
                                                                    {route.attemptedAgents.length > 1 ? (
                                                                        <span className="chip">
                                                                            {route.attemptedAgents.length}{' '}
                                                                            attempts
                                                                        </span>
                                                                    ) : null}
                                                                </>
                                                            );
                                                        })()}
                                                    </div>
                                                    {lineage ? (
                                                        <p className="message-lineage">
                                                            {lineage}
                                                        </p>
                                                    ) : null}

                                                    {message.role === 'user' &&
                                                    message.status === 'active' ? (
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
                                                                onClick={() =>
                                                                    void handleResend(message.id)
                                                                }
                                                                type="button"
                                                            >
                                                                Resend
                                                            </button>
                                                            <button
                                                                className="danger-btn"
                                                                onClick={() =>
                                                                    void handleRevoke(message.id)
                                                                }
                                                                type="button"
                                                            >
                                                                Revoke
                                                            </button>
                                                        </div>
                                                    ) : null}
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
                                            </article>
                                        </div>
                                    );
                                })()
                            ))
                        )}
                        {currentActiveRun?.streamContent ? (
                            <div className="message-row" data-role="assistant">
                                <article
                                    className="message-bubble"
                                    data-role="assistant"
                                    data-streaming="true"
                                >
                                    <div className="message-top">
                                        <strong>
                                            Assistant
                                            {currentActiveRun.agent
                                                ? ` · ${currentActiveRun.agent}`
                                                : ''}
                                        </strong>
                                        <span>
                                            live preview ·{' '}
                                            {formatTimestamp(
                                                currentActiveRun.streamUpdatedAt ??
                                                    currentActiveRun.startedAt,
                                            )}
                                        </span>
                                    </div>
                                    <MessageBody
                                        message={{
                                            id: -1,
                                            timestamp:
                                                currentActiveRun.streamUpdatedAt ??
                                                currentActiveRun.startedAt,
                                            channel: currentActiveRun.channel,
                                            chatId: currentActiveRun.chatId,
                                            userId: currentActiveRun.agent ?? 'assistant',
                                            role: 'assistant',
                                            content: currentActiveRun.streamContent,
                                            ...(currentActiveRun.agent
                                                ? { agent: currentActiveRun.agent }
                                                : {}),
                                            status: 'active',
                                        }}
                                    />
                                    <div className="message-footer">
                                        <div className="chip-row">
                                            <span className="chip" data-tone="teal">
                                                streaming
                                            </span>
                                            <span className="chip">
                                                run {currentActiveRun.runId.slice(0, 8)}
                                            </span>
                                            {currentActiveRun.streamParser ? (
                                                <span className="chip">
                                                    {currentActiveRun.streamParser}
                                                </span>
                                            ) : null}
                                        </div>
                                        <div className="stream-cursor" aria-hidden="true" />
                                    </div>
                                </article>
                            </div>
                        ) : null}
                    </div>

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
                                WillClaw keeps the shell context here. The coding agent
                                still does the core coding work.
                            </div>
                        )}

                        <div className="composer-card">
                            <div className="composer-preview">
                                {composerShowsSearch ? (
                                    <>
                                        <span className="chip" data-tone="accent">
                                            shell command
                                        </span>
                                        <span className="chip">/search</span>
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
                                            <span className="chip">
                                                explicit
                                            </span>
                                        ) : null}
                                        {routePreview.allowFallback &&
                                        routePreview.fallbackChain.length > 1 ? (
                                            <span className="chip">
                                                {routePreview.fallbackChain.length} fallback targets
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
                            <textarea
                                placeholder="Ask a coding agent, resume a thread, or use /search for shell-side memory."
                                value={composerText}
                                onChange={(event) =>
                                    setComposerText(event.target.value)
                                }
                            />
                            <div className="composer-toolbar">
                                <div className="composer-shortcuts">
                                    <button
                                        className="quiet-btn"
                                        onClick={() => setComposerText('/search ')}
                                        type="button"
                                    >
                                        /search
                                    </button>
                                    {availableAgents.slice(0, 4).map((agent) => (
                                        <button
                                            className="quiet-btn"
                                            key={agent.name}
                                            onClick={() =>
                                                setComposerText((current) =>
                                                    current.startsWith(`@${agent.name}`)
                                                        ? current
                                                        : `@${agent.name} ${current}`.trim(),
                                                )
                                            }
                                            type="button"
                                        >
                                            @{agent.name}
                                        </button>
                                    ))}
                                </div>
                                <div className="composer-controls">
                                    <select
                                        value={executionMode}
                                        onChange={(event) =>
                                            setExecutionMode(
                                                event.target
                                                    .value as 'foreground' | 'background',
                                            )
                                        }
                                    >
                                        <option value="foreground">
                                            foreground
                                        </option>
                                        <option value="background">
                                            background
                                        </option>
                                    </select>
                                    <button
                                        className="btn"
                                        disabled={submitting}
                                        onClick={() => void handleSend()}
                                        type="button"
                                    >
                                        {submitting ? 'Running…' : 'Send'}
                                    </button>
                                </div>
                            </div>
                            {lastRun?.chatId === selectedChatId ? (
                                <div className="hint-strip">
                                    <div className="hint">
                                        Last run via {lastRun.agent}
                                    </div>
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
                </section>

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
                                                        event.target
                                                            .value as SearchScope,
                                                    )
                                                }
                                            >
                                                <option value="all">all</option>
                                                <option value="messages">
                                                    messages
                                                </option>
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
                                            <span>
                                                {searchResults.messages.length}
                                            </span>
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
                                                        {
                                                            currentActiveRun.executionMode
                                                        }
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
                                                No tool activity recorded for this
                                                chat yet.
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
                                                void handleTaskRun(
                                                    '/api/heartbeat/run',
                                                )
                                            }
                                            type="button"
                                        >
                                            Run heartbeat
                                        </button>
                                        <button
                                            className="ghost-btn"
                                            onClick={() =>
                                                void handleTaskRun(
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
                                                void handleTaskRun(
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
                                                void handleTaskRun(
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
                                                        {task.lastResult ??
                                                            'never run'}
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
                                                    {formatTimestamp(
                                                        task.lastRunAt,
                                                    )}
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
                                            <label className="field-label" htmlFor="browser-target">
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
                                            <div className="toolbar">
                                                <button
                                                    className="ghost-btn"
                                                    disabled={
                                                        hostActionBusy || !screenApp.trim()
                                                    }
                                                    onClick={() =>
                                                        void runHostAction(
                                                            '/api/tools/screen/inspect-app',
                                                            {
                                                                chatId: selectedChatId,
                                                                app: screenApp.trim(),
                                                                languages: ['en-US', 'zh-Hans'],
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
                                                        void runHostAction(
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
                                                        hostActionBusy || !screenApp.trim()
                                                    }
                                                    onClick={() =>
                                                        void runHostAction(
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
                                                        hostActionBusy || !screenApp.trim()
                                                    }
                                                    onClick={() =>
                                                        void runHostAction(
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
                                                        void runHostAction(
                                                            '/api/tools/browser/open',
                                                            {
                                                                chatId: selectedChatId,
                                                                target: browserTarget.trim(),
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
                                                        void runHostAction(
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
                                                        void runHostAction(
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
                                                Reuses the current web chat as the hosted browser session.
                                            </p>
                                        </article>

                                        <article className="host-action-card">
                                            <label className="field-label" htmlFor="screen-app">
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
                                            <div className="toolbar">
                                                <button
                                                    className="ghost-btn"
                                                    disabled={hostActionBusy}
                                                    onClick={() =>
                                                        void runHostAction(
                                                            '/api/tools/screen/see',
                                                            {
                                                                chatId: selectedChatId,
                                                                ...(screenApp.trim()
                                                                    ? { app: screenApp.trim() }
                                                                    : { mode: 'frontmost' }),
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
                                                        void runHostAction(
                                                            '/api/tools/screen/capture',
                                                            {
                                                                chatId: selectedChatId,
                                                                ...(screenApp.trim()
                                                                    ? { app: screenApp.trim() }
                                                                    : { mode: 'screen' }),
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
                                                        void runHostAction(
                                                            '/api/tools/screen/ocr',
                                                            {
                                                                chatId: selectedChatId,
                                                                ...(screenApp.trim()
                                                                    ? { app: screenApp.trim() }
                                                                    : { mode: 'screen' }),
                                                            },
                                                        )
                                                    }
                                                    type="button"
                                                >
                                                    OCR
                                                </button>
                                            </div>
                                            <p className="muted">
                                                Uses macOS app control plus Peekaboo-first desktop actions. OCR uses Apple Vision after capture.
                                            </p>
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
                                            {pairingState?.enabled ? 'invite users' : 'disabled'}
                                        </span>
                                    </div>
                                    <div className="stack-list">
                                        <article className="host-action-card">
                                            <label className="field-label" htmlFor="pairing-kind">
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
                                                    <option value="channel">channel</option>
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
                                                        <option value="telegram">telegram</option>
                                                        <option value="discord">discord</option>
                                                        <option value="feishu">feishu</option>
                                                    </select>
                                                ) : null}
                                                <button
                                                    className="btn"
                                                    disabled={
                                                        pairingBusy || !pairingState?.enabled
                                                    }
                                                    onClick={() => {
                                                        void handleCreatePairingInvite();
                                                    }}
                                                    type="button"
                                                >
                                                    {pairingBusy ? 'Creating…' : 'Create invite'}
                                                </button>
                                            </div>
                                            <p className="muted">
                                                One-time codes are safer than handing out long-lived bearer tokens.
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
                                                {(pairingState?.invites ?? []).slice(0, 4).map((invite) => (
                                                    <div key={invite.id} className="provider-action-list">
                                                        <strong>
                                                            {invite.kind} · {invite.codePreview}
                                                        </strong>
                                                        <span className="muted">
                                                            {invite.active ? 'active' : 'inactive'} · uses {invite.usedCount}/{invite.maxUses}
                                                        </span>
                                                        {invite.revokedAt ? (
                                                            <span className="muted">
                                                                revoked {formatTimestamp(invite.revokedAt)}
                                                            </span>
                                                        ) : null}
                                                        <div className="toolbar">
                                                            <button
                                                                className="ghost-btn"
                                                                disabled={pairingBusy || !invite.active}
                                                                onClick={() => {
                                                                    void handleRevokePairingInvite(invite.id);
                                                                }}
                                                                type="button"
                                                            >
                                                                Revoke
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                                {(pairingState?.invites.length ?? 0) === 0 ? (
                                                    <div className="empty">No pairing invites yet.</div>
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
                                                {(pairingState?.grants ?? []).slice(0, 4).map((grant) => (
                                                    <div key={grant.id} className="provider-action-list">
                                                        <strong>
                                                            {grant.channel} · {grant.userId}
                                                        </strong>
                                                        <span className="muted">
                                                            invite {grant.inviteId.slice(0, 8)}
                                                        </span>
                                                        <div className="toolbar">
                                                            <button
                                                                className="ghost-btn"
                                                                disabled={pairingBusy}
                                                                onClick={() => {
                                                                    void handleRevokePairingGrant(grant.id);
                                                                }}
                                                                type="button"
                                                            >
                                                                Revoke
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                                {(pairingState?.grants.length ?? 0) === 0 ? (
                                                    <div className="empty">No paired channel users yet.</div>
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
                                                <p className="muted">{entry.detail}</p>
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
            </div>
        </main>
    );
}
