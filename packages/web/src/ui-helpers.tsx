import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import type {
    ActiveRun,
    AgentAvailability,
    AssistantRouteMetadata,
    ChatSummary,
    RealtimeEvent,
    RoutePlan,
    SchedulerResult,
    StoredMessage,
} from './ui-types.js';

export function collapseWhitespace(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

export function stripMarkdown(value: string): string {
    return collapseWhitespace(value.replace(/[`*_>#~-]+/g, ' '));
}

export function summarizeText(value: string, limit = 92): string {
    const normalized = stripMarkdown(value);
    if (normalized.length <= limit) {
        return normalized;
    }

    return `${normalized.slice(0, Math.max(0, limit - 1)).trim()}…`;
}

export function createDraftChatId(): string {
    return `chat-${Date.now().toString(36)}`;
}

export function formatTimestamp(value?: string): string {
    if (!value) {
        return 'Pending';
    }

    return new Date(value).toLocaleString();
}

export function formatRelativeTime(value?: string): string {
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

export function formatDuration(value?: number): string {
    if (!value) {
        return 'n/a';
    }

    if (value >= 1000) {
        return `${(value / 1000).toFixed(1)}s`;
    }

    return `${value}ms`;
}

export function formatStructuredResult(value: unknown): string {
    if (typeof value === 'string') {
        return value;
    }

    return JSON.stringify(value, null, 2);
}

export function messageLabel(message: StoredMessage): string {
    if (message.role === 'assistant') {
        return message.agent ? `Assistant · ${message.agent}` : 'Assistant';
    }

    if (message.role === 'system') {
        return 'System';
    }

    return 'You';
}

export function buildEditedSuccessorMap(
    messages: StoredMessage[],
): Map<number, StoredMessage> {
    const map = new Map<number, StoredMessage>();

    for (const message of messages) {
        if (message.editOf != null) {
            map.set(message.editOf, message);
        }
    }

    return map;
}

export function describeMessageLineage(
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

export function conversationTitle(
    chat: ChatSummary | null,
    fallbackChatId: string,
): string {
    const preview = chat ? summarizeText(chat.preview, 42) : '';
    if (preview) {
        return preview;
    }

    if (fallbackChatId === 'default') {
        return 'General shell';
    }

    return `Conversation ${fallbackChatId.slice(0, 8)}`;
}

export function conversationSubtitle(chat: ChatSummary | null): string {
    if (!chat) {
        return 'Fresh conversation. Route a prompt to any coding agent shell-side.';
    }

    const preview = summarizeText(chat.preview, 120);
    if (preview) {
        return preview;
    }

    return `${chat.messageCount} messages in this thread`;
}

export function toolPolicySummary(agent: AgentAvailability): string {
    return Object.entries(agent.toolPolicies)
        .map(([tool, mode]) => `${tool}:${mode}`)
        .join(' · ');
}

export function taskTone(
    result?: SchedulerResult,
): 'accent' | 'teal' | 'danger' {
    if (result === 'completed') {
        return 'teal';
    }

    if (result === 'failed') {
        return 'danger';
    }

    return 'accent';
}

export function readPayloadString(
    payload: Record<string, unknown>,
    key: string,
): string | undefined {
    const value = payload[key];
    return typeof value === 'string' ? value : undefined;
}

export function readPayloadStringArray(
    payload: Record<string, unknown>,
    key: string,
): string[] | undefined {
    const value = payload[key];
    if (!Array.isArray(value)) {
        return undefined;
    }

    return value.filter((entry): entry is string => typeof entry === 'string');
}

export function cleanSnippet(value: string): string {
    return collapseWhitespace(value.replace(/\[|\]/g, ''));
}

export function upsertActiveRun(
    current: ActiveRun[],
    incoming: ActiveRun,
): ActiveRun[] {
    const next = current.filter((entry) => entry.runId !== incoming.runId);
    next.unshift(incoming);
    return next.slice(0, 8);
}

export function isSearchCommand(text: string): boolean {
    return text.trim().startsWith('/search');
}

export function routeReasonLabel(reason?: RoutePlan['reason'] | string): string {
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

export function extractAssistantRouteMetadata(
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

export function describeRealtimeEvent(event: RealtimeEvent): {
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
                detail:
                    readPayloadString(event.payload, 'error') ?? 'Attempt failed',
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
                detail:
                    readPayloadString(event.payload, 'executionMode') ??
                    'foreground',
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
                detail:
                    readPayloadString(event.payload, 'error') ?? 'Unknown failure',
            };
        case 'chat.run.cancelled':
            return {
                title: 'Run cancelled',
                detail:
                    readPayloadString(event.payload, 'error') ?? 'Cancelled',
            };
        case 'message.created':
            return {
                title: 'Message saved',
                detail: readPayloadString(event.payload, 'role') ?? 'message',
            };
        case 'message.revoked':
            return {
                title: 'Message revoked',
                detail:
                    readPayloadString(event.payload, 'subtype') ?? 'revoked',
            };
        default:
            return {
                title: event.type,
                detail: formatTimestamp(event.timestamp),
            };
    }
}

export function shouldTrackRecentEvent(eventType: string): boolean {
    return eventType !== 'chat.run.stream.delta';
}

export async function readJson<T>(
    input: RequestInfo,
    init?: RequestInit,
): Promise<T> {
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

export function MessageBody({ message }: { message: StoredMessage }) {
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
                    a: ({ ...props }) => (
                        <a {...props} rel="noreferrer" target="_blank" />
                    ),
                }}
            >
                {message.content}
            </ReactMarkdown>
        </div>
    );
}
