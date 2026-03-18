import type { AcpAgentPoolEntry } from '../config.js';

import { AgentExecutionError } from './errors.js';
import type {
    AgentBackend,
    AgentRequest,
    AgentResponse,
    AgentTextStreamParser,
} from './types.js';
import { extractTextFromStructuredOutput } from './structured-output.js';

interface AcpStreamEvent {
    event: string;
    data: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function emitTextStreamUpdate(
    request: AgentRequest,
    currentContent: string,
    previousContent: string,
    parser: AgentTextStreamParser,
): string {
    if (!request.onTextStream || !currentContent || currentContent === previousContent) {
        return previousContent;
    }

    const mode = currentContent.startsWith(previousContent) ? 'delta' : 'snapshot';
    const delta =
        mode === 'delta'
            ? currentContent.slice(previousContent.length)
            : currentContent;

    request.onTextStream({
        content: currentContent,
        delta,
        mode,
        parser,
    });

    return currentContent;
}

function collectTextParts(
    value: unknown,
    parts: string[],
    depth = 0,
    visited = new WeakSet<object>(),
): void {
    if (depth > 8 || value == null) {
        return;
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) {
            parts.push(trimmed);
        }
        return;
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            collectTextParts(item, parts, depth + 1, visited);
        }
        return;
    }

    if (!isRecord(value)) {
        return;
    }

    if (visited.has(value)) {
        return;
    }

    visited.add(value);

    const preferredKeys = [
        'text',
        'content',
        'message',
        'messages',
        'response',
        'responses',
        'result',
        'results',
        'output',
        'outputs',
        'assistant',
        'parts',
        'delta',
    ];

    const seen = new Set<string>();
    for (const key of preferredKeys) {
        if (key in value) {
            collectTextParts(value[key], parts, depth + 1, visited);
            seen.add(key);
        }
    }

    for (const [key, nested] of Object.entries(value)) {
        if (seen.has(key) || key === 'id' || key === 'type' || key === 'usage') {
            continue;
        }

        collectTextParts(nested, parts, depth + 1, visited);
    }
}

function extractTextCandidate(value: unknown): string {
    const parts: string[] = [];
    collectTextParts(value, parts);
    return parts.join('\n\n').trim();
}

function parseSseEvents(buffer: string): {
    events: AcpStreamEvent[];
    rest: string;
} {
    const chunks = buffer.split(/\n\n/);
    const rest = chunks.pop() ?? '';
    const events: AcpStreamEvent[] = [];

    for (const chunk of chunks) {
        const lines = chunk
            .split('\n')
            .map((line) => line.trimEnd())
            .filter((line) => line.length > 0 && !line.startsWith(':'));
        if (lines.length === 0) {
            continue;
        }

        let eventName = 'message';
        const dataLines: string[] = [];

        for (const line of lines) {
            if (line.startsWith('event:')) {
                eventName = line.slice(6).trim();
                continue;
            }

            if (line.startsWith('data:')) {
                dataLines.push(line.slice(5).trimStart());
            }
        }

        if (dataLines.length === 0) {
            continue;
        }

        events.push({
            event: eventName,
            data: dataLines.join('\n'),
        });
    }

    return {
        events,
        rest,
    };
}

function applyStreamPayload(options: {
    payload: Record<string, unknown>;
    eventName: string;
    content: string;
    request: AgentRequest;
    streamedContent: string;
    parser: AgentTextStreamParser;
}): {
    content: string;
    streamedContent: string;
    done: boolean;
} {
    const payloadType =
        typeof options.payload.type === 'string'
            ? options.payload.type.toLowerCase()
            : options.eventName.toLowerCase();

    if (payloadType.includes('error')) {
        throw new AgentExecutionError(
            extractTextCandidate(options.payload.error ?? options.payload) ||
                'ACP stream returned an error event',
            {
                agent: 'acp-stream',
            },
        );
    }

    if (
        payloadType === 'done' ||
        payloadType === 'complete' ||
        payloadType === 'completed'
    ) {
        const snapshot = extractTextCandidate(
            options.payload.message ??
            options.payload.output ??
            options.payload.result ??
            options.payload,
        );
        const nextContent = snapshot || options.content;

        return {
            content: nextContent,
            streamedContent: emitTextStreamUpdate(
                options.request,
                nextContent,
                options.streamedContent,
                options.parser,
            ),
            done: true,
        };
    }

    const delta = extractTextCandidate(options.payload.delta);
    if (delta) {
        const nextContent = `${options.content}${delta}`.trim();
        return {
            content: nextContent,
            streamedContent: emitTextStreamUpdate(
                options.request,
                nextContent,
                options.streamedContent,
                options.parser,
            ),
            done: false,
        };
    }

    const snapshot = extractTextCandidate(
        options.payload.message ??
        options.payload.output ??
        options.payload.result ??
        options.payload.content ??
        options.payload.text ??
        options.payload,
    );
    if (snapshot && snapshot !== options.content) {
        return {
            content: snapshot,
            streamedContent: emitTextStreamUpdate(
                options.request,
                snapshot,
                options.streamedContent,
                options.parser,
            ),
            done: false,
        };
    }

    return {
        content: options.content,
        streamedContent: options.streamedContent,
        done: false,
    };
}

async function readSseResponse(
    response: Response,
    request: AgentRequest,
): Promise<{
    content: string;
    rawOutput: string;
    metadata: Record<string, unknown>;
}> {
    const reader = response.body?.getReader();
    if (!reader) {
        const rawText = await response.text();
        return {
            content: extractTextFromStructuredOutput(rawText),
            rawOutput: rawText,
            metadata: {
                parser: 'plain_text',
            },
        };
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let rawOutput = '';
    let content = '';
    let streamedContent = '';
    const eventTypes = new Set<string>();

    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }

        const chunk = decoder.decode(value, { stream: true });
        rawOutput += chunk;
        buffer += chunk;

        const parsed = parseSseEvents(buffer);
        buffer = parsed.rest;

        for (const event of parsed.events) {
            if (event.data === '[DONE]') {
                continue;
            }

            const payload = JSON.parse(event.data) as Record<string, unknown>;
            eventTypes.add(
                typeof payload.type === 'string' ? payload.type : event.event,
            );
            const next = applyStreamPayload({
                payload,
                eventName: event.event,
                content,
                request,
                streamedContent,
                parser: 'event_stream',
            });
            content = next.content;
            streamedContent = next.streamedContent;

            if (next.done) {
                return {
                    content: content || extractTextFromStructuredOutput(rawOutput),
                    rawOutput,
                    metadata: {
                        parser: 'event_stream',
                        eventTypes: [...eventTypes],
                    },
                };
            }
        }
    }

    return {
        content: content || extractTextFromStructuredOutput(rawOutput),
        rawOutput,
        metadata: {
            parser: 'event_stream',
            eventTypes: [...eventTypes],
        },
    };
}

async function readNdjsonResponse(
    response: Response,
    request: AgentRequest,
): Promise<{
    content: string;
    rawOutput: string;
    metadata: Record<string, unknown>;
}> {
    const reader = response.body?.getReader();
    if (!reader) {
        const rawText = await response.text();
        return {
            content: extractTextFromStructuredOutput(rawText),
            rawOutput: rawText,
            metadata: {
                parser: 'linewise_json',
            },
        };
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let rawOutput = '';
    let content = '';
    let streamedContent = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }

        const chunk = decoder.decode(value, { stream: true });
        rawOutput += chunk;
        buffer += chunk;

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) {
                continue;
            }

            const payload = JSON.parse(trimmed) as Record<string, unknown>;
            const next = applyStreamPayload({
                payload,
                eventName: 'line',
                content,
                request,
                streamedContent,
                parser: 'linewise_json',
            });
            content = next.content;
            streamedContent = next.streamedContent;
        }
    }

    const trimmedRest = buffer.trim();
    if (trimmedRest) {
        const payload = JSON.parse(trimmedRest) as Record<string, unknown>;
        const next = applyStreamPayload({
            payload,
            eventName: 'line',
            content,
            request,
            streamedContent,
            parser: 'linewise_json',
        });
        content = next.content;
        streamedContent = next.streamedContent;
    }

    return {
        content: content || extractTextFromStructuredOutput(rawOutput),
        rawOutput,
        metadata: {
            parser: 'linewise_json',
        },
    };
}

function shouldRetrySync(status: number): boolean {
    return [400, 404, 405, 406, 415, 422, 501].includes(status);
}

export class AcpAgentBackend implements AgentBackend {
    readonly type = 'acp' as const;
    private readonly activeRuns = new Map<string, AbortController>();

    constructor(
        readonly name: string,
        private readonly config: AcpAgentPoolEntry,
    ) { }

    async execute(request: AgentRequest): Promise<AgentResponse> {
        const startedAt = Date.now();
        const controller = new AbortController();
        this.activeRuns.set(request.runId, controller);

        try {
            let response = await this.executeRequest(request, controller, {
                mode: request.onTextStream ? 'stream' : 'sync',
            });

            if (
                request.onTextStream &&
                !response.ok &&
                shouldRetrySync(response.status)
            ) {
                await response.arrayBuffer();
                response = await this.executeRequest(request, controller, {
                    mode: 'sync',
                });
            }

            const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';

            if (!response.ok) {
                const rawText = await response.text();
                throw new AgentExecutionError(`ACP agent returned ${response.status}`, {
                    agent: this.name,
                    stderr: rawText,
                    exitCode: response.status,
                });
            }

            if (request.onTextStream && contentType.includes('text/event-stream')) {
                const streamedResponse = await readSseResponse(response, request);
                return {
                    content: streamedResponse.content,
                    agent: this.name,
                    duration: Date.now() - startedAt,
                    rawOutput: streamedResponse.rawOutput,
                    metadata: streamedResponse.metadata,
                };
            }

            if (
                request.onTextStream &&
                (contentType.includes('ndjson') || contentType.includes('jsonl'))
            ) {
                const streamedResponse = await readNdjsonResponse(response, request);
                return {
                    content: streamedResponse.content,
                    agent: this.name,
                    duration: Date.now() - startedAt,
                    rawOutput: streamedResponse.rawOutput,
                    metadata: streamedResponse.metadata,
                };
            }

            const rawText = await response.text();
            return {
                content: extractTextFromStructuredOutput(rawText),
                agent: this.name,
                duration: Date.now() - startedAt,
                rawOutput: rawText,
            };
        } catch (error) {
            if (error instanceof AgentExecutionError) {
                throw error;
            }

            throw new AgentExecutionError(
                error instanceof Error
                    ? `ACP request failed: ${error.message}`
                    : 'ACP request failed',
                {
                    agent: this.name,
                    cause: error,
                },
            );
        } finally {
            this.activeRuns.delete(request.runId);
        }
    }

    async cancel(runId: string): Promise<void> {
        const controller = this.activeRuns.get(runId);
        if (!controller) {
            return;
        }

        controller.abort();
        this.activeRuns.delete(runId);
    }

    async isAvailable(): Promise<boolean> {
        if (this.config.auth?.type === 'bearer') {
            return Boolean(process.env[this.config.auth.token_env]);
        }

        return Boolean(this.config.url);
    }

    private async executeRequest(
        request: AgentRequest,
        controller: AbortController,
        options: {
            mode: 'sync' | 'stream';
        },
    ): Promise<Response> {
        const headers: Record<string, string> = {
            'content-type': 'application/json',
            accept:
                options.mode === 'stream'
                    ? 'text/event-stream, application/x-ndjson, application/json'
                    : 'application/json',
        };

        if (this.config.auth?.type === 'bearer') {
            const token = process.env[this.config.auth.token_env];
            if (!token) {
                throw new AgentExecutionError(
                    `Missing ACP bearer token in env ${this.config.auth.token_env}`,
                    {
                        agent: this.name,
                    },
                );
            }

            headers.authorization = `Bearer ${token}`;
        }

        return await fetch(
            `${this.config.url.replace(/\/$/, '')}/agents/${this.config.agent_id}/run`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    mode: options.mode,
                    input: {
                        system: request.systemPrompt,
                        messages: [
                            ...request.history,
                            {
                                role: 'user',
                                content: request.text,
                            },
                        ],
                    },
                }),
                signal: controller.signal,
            },
        );
    }
}
