export type MessageRole = 'user' | 'assistant' | 'system';
export type SchedulerResult = 'completed' | 'failed' | 'suppressed';
export type SearchScope = 'all' | 'messages' | 'files' | 'memory' | 'daily_note';
export type InspectorTab = 'search' | 'activity' | 'runtime';

export const AUTH_SCOPE_OPTIONS = [
    'api:read',
    'api:write',
    'api:tools',
    'api:events',
    'api:session',
    'acp',
] as const;

export const WEB_CHANNEL = 'web';
export const DEFAULT_CHAT = 'default';
export const WEB_USER = 'web-ui';

export interface AgentAvailability {
    name: string;
    type: string;
    enabled: boolean;
    available: boolean;
    toolPolicies: Record<string, string>;
}

export interface HostTool {
    name: string;
    label: string;
    category: string;
    globalEnabled: boolean;
    preferredProvider?: string;
    fallbackProvider?: string;
    mode?: string;
}

export interface ProviderActionHealth {
    action: string;
    available: boolean;
    healthy: boolean;
    detail: string;
}

export interface ProviderHealthEntry {
    tool: 'browser' | 'screen';
    provider: string;
    configured: boolean;
    available: boolean;
    healthy: boolean;
    detail: string;
    installHint?: string;
    actions: ProviderActionHealth[];
}

export interface PairingInvite {
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

export interface PairingGrant {
    id: string;
    channel: 'telegram' | 'discord' | 'feishu';
    userId: string;
    inviteId: string;
    createdAt: string;
}

export interface PairingPayload {
    enabled: boolean;
    invites: PairingInvite[];
    grants: PairingGrant[];
}

export interface CreatedPairingInvite {
    id: string;
    code: string;
    kind: 'web' | 'channel';
    createdAt: string;
    expiresAt: string;
    maxUses: number;
    scopes: string[];
    channels: Array<'telegram' | 'discord' | 'feishu'>;
}

export interface StatusPayload {
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

export interface AuthStatusPayload {
    authRequired: boolean;
    authenticated: boolean;
    sessionCookieName: string;
    scopes: string[];
    pairingEnabled?: boolean;
    tokenId?: string;
    source?: 'bearer' | 'session';
    expiresAt?: string;
}

export interface AuthTokenSummary {
    id: string;
    scopes: string[];
    legacy: boolean;
    source: 'configured' | 'managed';
    active: boolean;
    tokenPreview?: string;
    createdAt?: string;
    revokedAt?: string;
}

export interface AuthSessionSummary {
    id: string;
    tokenId: string;
    scopes: string[];
    createdAt: string;
    expiresAt: string;
}

export interface CreatedAuthToken {
    id: string;
    token: string;
    scopes: string[];
    createdAt: string;
    tokenPreview: string;
}

export interface ChatSummary {
    channel: string;
    chatId: string;
    updatedAt: string;
    messageCount: number;
    preview: string;
    role: MessageRole;
    agent?: string;
    runId?: string;
}

export interface StoredMessage {
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

export interface ChatResult {
    runId: string;
    agent: string;
    content: string;
    duration: number;
    channel: string;
    chatId: string;
    userMessageId: number;
    assistantMessageId: number;
}

export interface SearchMessageResult {
    id: number;
    timestamp: string;
    channel: string;
    chatId: string;
    role: MessageRole;
    content: string;
    snippet: string;
}

export interface SearchFileResult {
    id: number;
    filepath: string;
    fileType: string;
    snippet: string;
    updatedAt: string;
    content: string;
}

export interface MemorySearchResult {
    messages: SearchMessageResult[];
    files: SearchFileResult[];
}

export interface ToolLogEntry {
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

export interface SchedulerTaskStatus {
    id: string;
    kind: 'heartbeat' | 'cron' | 'maintenance';
    name: string;
    schedule: string;
    running: boolean;
    lastRunAt?: string;
    lastResult?: SchedulerResult;
    lastError?: string;
}

export interface CronPayload {
    heartbeat: SchedulerTaskStatus | null;
    cron: SchedulerTaskStatus[];
    maintenance: SchedulerTaskStatus[];
}

export interface QueueRunSummary {
    runId: string;
    channel: string;
    chatId: string;
    userId: string;
    userMessageId: number;
    status: 'queued' | 'running';
    position: number;
    ahead: number;
}

export interface QueueSummary {
    channel: string;
    chatId: string;
    total: number;
    queued: number;
    running: number;
    runs: QueueRunSummary[];
}

export interface RealtimeEvent {
    id: string;
    type: string;
    timestamp: string;
    payload: Record<string, unknown>;
}

export interface ActiveRun {
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

export interface RoutePlan {
    text: string;
    strippedText: string;
    selectedAgent: string;
    explicitAgent?: string;
    fallbackChain: string[];
    allowFallback: boolean;
    reason:
        | 'explicit'
        | 'mode_hint'
        | 'hosted_tools'
        | 'long_context'
        | 'read_only_coding'
        | 'coding'
        | 'simple_qa';
    looksLikeCoding: boolean;
    looksLikeLongContext: boolean;
    looksLikeMutating: boolean;
    looksLikeHostedTools?: boolean;
    modeHint?: 'hosted_tools' | 'long_context' | 'coding' | 'simple_qa';
}

export interface AssistantRouteMetadata {
    selectedAgent?: string;
    explicitAgent?: string;
    fallbackChain: string[];
    reason?: string;
    attemptedAgents: string[];
}
