import path from 'node:path';

import type { SearchFileResult, SearchMessageResult } from './memory.js';
import type {
    MemorySearchResult,
    WorkspaceMemoryManager,
} from './workspace-memory.js';

export const MEMORY_SEARCH_BRIDGE_PREFIX = 'WILLCLAW_MEMORY_SEARCH';
const DEFAULT_MESSAGE_LIMIT = 5;
const DEFAULT_FILE_LIMIT = 3;
const MAX_LIMIT = 20;

function tokenizeCommand(input: string): string[] {
    return (
        input.match(/"[^"]*"|'[^']*'|\S+/g)?.map((token) => {
            if (
                (token.startsWith('"') && token.endsWith('"')) ||
                (token.startsWith('\'') && token.endsWith('\''))
            ) {
                return token.slice(1, -1);
            }

            return token;
        }) ?? []
    );
}

function clampLimit(value: number | undefined, fallback: number): number {
    if (!value || !Number.isFinite(value)) {
        return fallback;
    }

    return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(value)));
}

function isDateKey(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function buildDayRange(dateKey: string): { from: string; to: string } {
    const from = new Date(`${dateKey}T00:00:00.000Z`);
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 1);

    return {
        from: from.toISOString(),
        to: to.toISOString(),
    };
}

function normalizeSnippet(snippet: string): string {
    return snippet.replace(/\s+/g, ' ').trim();
}

function formatMessageResult(result: SearchMessageResult): string {
    return `${result.timestamp} | ${result.channel}/${result.chatId} | ${result.role} | ${normalizeSnippet(result.snippet)}`;
}

function formatFileResult(result: SearchFileResult): string {
    return `${path.basename(result.filepath)} (${result.fileType}) | ${normalizeSnippet(result.snippet)}`;
}

function parseBridgePayload(payload: string): Record<string, unknown> | null {
    try {
        const parsed = JSON.parse(payload) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
        }
    } catch {
        return null;
    }

    return null;
}

export function renderMemorySearchBridgeInstructions(): string {
    return `WillClaw exposes one hosted capability: memory_search.
If you need prior messages, MEMORY.md, or daily notes, reply with exactly one line and nothing else:
${MEMORY_SEARCH_BRIDGE_PREFIX} {"query":"what to search","channel":"optional","chatId":"optional","date":"YYYY-MM-DD","filesOnly":false,"messagesOnly":false,"fileType":"memory|daily_note","messageLimit":5,"fileLimit":3}
After WillClaw returns the results, continue the task and then send the final assistant answer.`;
}

function normalizeRequest(
    input: Record<string, unknown>,
): MemorySearchRequest | null {
    const query =
        typeof input.query === 'string'
            ? input.query.trim()
            : typeof input.q === 'string'
                ? input.q.trim()
                : '';

    if (!query) {
        return null;
    }

    const request: MemorySearchRequest = {
        query,
    };
    if (typeof input.channel === 'string' && input.channel.trim()) {
        request.channel = input.channel.trim();
    }
    if (typeof input.chatId === 'string' && input.chatId.trim()) {
        request.chatId = input.chatId.trim();
    }
    if (typeof input.fileType === 'string' && input.fileType.trim()) {
        request.fileType = input.fileType.trim();
    }
    if (typeof input.date === 'string' && isDateKey(input.date.trim())) {
        request.dateKey = input.date.trim();
        Object.assign(request, buildDayRange(request.dateKey));
        request.filepathLike = `%/${request.dateKey}.md`;
    }
    if (input.filesOnly === true) {
        request.filesOnly = true;
    }
    if (input.messagesOnly === true) {
        request.messagesOnly = true;
    }
    if (typeof input.messageLimit === 'number') {
        request.messageLimit = clampLimit(input.messageLimit, DEFAULT_MESSAGE_LIMIT);
    }
    if (typeof input.fileLimit === 'number') {
        request.fileLimit = clampLimit(input.fileLimit, DEFAULT_FILE_LIMIT);
    }

    return request;
}

export interface MemorySearchRequest {
    query: string;
    channel?: string;
    chatId?: string;
    fileType?: string;
    from?: string;
    to?: string;
    dateKey?: string;
    filepathLike?: string;
    messageLimit?: number;
    fileLimit?: number;
    filesOnly?: boolean;
    messagesOnly?: boolean;
    excludeRunId?: string;
}

export interface ParsedSearchCommand {
    kind: 'search';
    request: MemorySearchRequest;
}

export interface InvalidSearchCommand {
    kind: 'search';
    error: string;
    usage: string;
}

export type SearchCommandParseResult =
    | ParsedSearchCommand
    | InvalidSearchCommand;

export interface HostedMemorySearchUse {
    query: string;
    messageCount: number;
    fileCount: number;
}

export class MemorySearchService {
    readonly commandUsage =
        '/search [--channel <channel>] [--chat <chatId>] [--date <YYYY-MM-DD>] [--files|--messages] [--memory|--daily-notes] [--limit <n>] <query>';

    constructor(
        private readonly workspaceMemoryManager: WorkspaceMemoryManager,
    ) { }

    parseCommand(text: string): SearchCommandParseResult | null {
        const trimmed = text.trim();
        if (!trimmed.startsWith('/search')) {
            return null;
        }

        const tokens = tokenizeCommand(trimmed);
        if (tokens.length === 0 || tokens[0] !== '/search') {
            return null;
        }

        const request: Partial<MemorySearchRequest> = {};
        const queryParts: string[] = [];

        for (let index = 1; index < tokens.length; index += 1) {
            const token = tokens[index];

            if (!token) {
                continue;
            }

            if (token === '--channel' || token === '--chat' || token === '--date' || token === '--limit') {
                const value = tokens[index + 1];
                if (!value) {
                    return {
                        kind: 'search',
                        error: `Missing value for ${token}.`,
                        usage: this.commandUsage,
                    };
                }

                if (token === '--channel') {
                    request.channel = value;
                } else if (token === '--chat') {
                    request.chatId = value;
                } else if (token === '--date') {
                    if (!isDateKey(value)) {
                        return {
                            kind: 'search',
                            error: 'Date must use YYYY-MM-DD format.',
                            usage: this.commandUsage,
                        };
                    }

                    request.dateKey = value;
                    Object.assign(request, buildDayRange(value));
                    request.filepathLike = `%/${value}.md`;
                } else {
                    const parsed = Number(value);
                    if (!Number.isFinite(parsed) || parsed < 1) {
                        return {
                            kind: 'search',
                            error: 'Limit must be a positive number.',
                            usage: this.commandUsage,
                        };
                    }

                    request.messageLimit = clampLimit(parsed, DEFAULT_MESSAGE_LIMIT);
                    request.fileLimit = clampLimit(parsed, DEFAULT_FILE_LIMIT);
                }

                index += 1;
                continue;
            }

            if (token === '--files') {
                request.filesOnly = true;
                continue;
            }

            if (token === '--messages') {
                request.messagesOnly = true;
                continue;
            }

            if (token === '--memory') {
                request.filesOnly = true;
                request.fileType = 'memory';
                continue;
            }

            if (token === '--daily-notes') {
                request.filesOnly = true;
                request.fileType = 'daily_note';
                continue;
            }

            queryParts.push(token);
        }

        const query = queryParts.join(' ').trim();
        if (!query) {
            return {
                kind: 'search',
                error: 'Search query cannot be empty.',
                usage: this.commandUsage,
            };
        }

        request.query = query;
        request.messageLimit = clampLimit(
            request.messageLimit,
            DEFAULT_MESSAGE_LIMIT,
        );
        request.fileLimit = clampLimit(request.fileLimit, DEFAULT_FILE_LIMIT);

        return {
            kind: 'search',
            request: request as MemorySearchRequest,
        };
    }

    parseBridgeRequest(content: string): MemorySearchRequest | null {
        const trimmed = content.trim();
        if (!trimmed.startsWith(MEMORY_SEARCH_BRIDGE_PREFIX)) {
            return null;
        }

        const payload = trimmed
            .slice(MEMORY_SEARCH_BRIDGE_PREFIX.length)
            .trim();
        if (!payload) {
            return null;
        }

        if (payload.startsWith('{')) {
            return normalizeRequest(parseBridgePayload(payload) ?? {});
        }

        return {
            query: payload,
            messageLimit: DEFAULT_MESSAGE_LIMIT,
            fileLimit: DEFAULT_FILE_LIMIT,
        };
    }

    search(request: MemorySearchRequest): MemorySearchResult {
        const messageLimit = request.filesOnly
            ? 0
            : clampLimit(request.messageLimit, DEFAULT_MESSAGE_LIMIT);
        const fileLimit = request.messagesOnly
            ? 0
            : clampLimit(request.fileLimit, DEFAULT_FILE_LIMIT);
        const options: Parameters<WorkspaceMemoryManager['search']>[1] = {
            messageLimit,
            fileLimit,
        };

        if (request.channel) {
            options.channel = request.channel;
        }
        if (request.chatId) {
            options.chatId = request.chatId;
        }
        if (request.fileType) {
            options.fileType = request.fileType;
        }
        if (request.from) {
            options.from = request.from;
        }
        if (request.to) {
            options.to = request.to;
        }
        if (request.filepathLike) {
            options.filepathLike = request.filepathLike;
        }
        if (request.excludeRunId) {
            options.excludeRunId = request.excludeRunId;
        }

        return this.workspaceMemoryManager.search(request.query, options);
    }

    formatCommandResult(
        request: MemorySearchRequest,
        result: MemorySearchResult,
    ): string {
        const lines = [`WillClaw search: "${request.query}"`];
        const scope: string[] = [];

        if (request.channel) {
            scope.push(`channel=${request.channel}`);
        }
        if (request.chatId) {
            scope.push(`chat=${request.chatId}`);
        }
        if (request.dateKey) {
            scope.push(`date=${request.dateKey}`);
        }
        if (request.fileType) {
            scope.push(`fileType=${request.fileType}`);
        }
        if (request.filesOnly) {
            scope.push('scope=files');
        }
        if (request.messagesOnly) {
            scope.push('scope=messages');
        }

        if (scope.length > 0) {
            lines.push(`Filters: ${scope.join(', ')}`);
        }

        if (result.messages.length === 0 && result.files.length === 0) {
            lines.push('No matches found.');
            lines.push(`Usage: ${this.commandUsage}`);
            return lines.join('\n');
        }

        if (result.messages.length > 0) {
            lines.push('');
            lines.push(`Messages (${result.messages.length}):`);
            for (const [index, entry] of result.messages.entries()) {
                lines.push(`${index + 1}. ${formatMessageResult(entry)}`);
            }
        }

        if (result.files.length > 0) {
            lines.push('');
            lines.push(`Files (${result.files.length}):`);
            for (const [index, entry] of result.files.entries()) {
                lines.push(`${index + 1}. ${formatFileResult(entry)}`);
            }
        }

        return lines.join('\n');
    }

    formatToolResult(
        request: MemorySearchRequest,
        result: MemorySearchResult,
    ): string {
        const lines = [
            `WillClaw memory_search results for "${request.query}".`,
        ];

        if (result.messages.length === 0 && result.files.length === 0) {
            lines.push('No relevant matches found in messages, MEMORY.md, or daily notes.');
            return lines.join('\n');
        }

        if (result.messages.length > 0) {
            lines.push('Messages:');
            for (const entry of result.messages) {
                lines.push(`- ${formatMessageResult(entry)}`);
            }
        }

        if (result.files.length > 0) {
            lines.push('Files:');
            for (const entry of result.files) {
                lines.push(`- ${formatFileResult(entry)}`);
            }
        }

        lines.push('Continue the task using only the relevant results above.');
        return lines.join('\n');
    }
}
