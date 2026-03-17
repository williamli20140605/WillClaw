import type { ApiAgentPoolEntry } from '../config.js';

import { AgentExecutionError } from './errors.js';
import type {
    AgentBackend,
    AgentRequest,
    AgentResponse,
    ChatMessage,
} from './types.js';

function toAnthropicMessages(history: ChatMessage[], text: string) {
    const messages = history
        .filter(
            (message): message is ChatMessage & { role: 'user' | 'assistant' } =>
                message.role === 'user' || message.role === 'assistant',
        )
        .map((message) => ({
            role: message.role,
            content: [{ type: 'text', text: message.content }],
        }));

    messages.push({
        role: 'user',
        content: [{ type: 'text', text }],
    });

    return messages;
}

function readAnthropicText(payload: unknown): string {
    if (
        !payload ||
        typeof payload !== 'object' ||
        !('content' in payload) ||
        !Array.isArray(payload.content)
    ) {
        return '';
    }

    return payload.content
        .flatMap((item) => {
            if (
                item &&
                typeof item === 'object' &&
                'type' in item &&
                item.type === 'text' &&
                'text' in item &&
                typeof item.text === 'string'
            ) {
                return [item.text];
            }

            return [];
        })
        .join('\n\n')
        .trim();
}

interface AnthropicStreamEvent {
    event: string;
    data: string;
}

function emitTextStreamUpdate(
    request: AgentRequest,
    currentContent: string,
    previousContent: string,
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
        parser: 'anthropic_sse',
    });
    return currentContent;
}

function parseSseEvents(buffer: string): {
    events: AnthropicStreamEvent[];
    rest: string;
} {
    const chunks = buffer.split(/\n\n/);
    const rest = chunks.pop() ?? '';
    const events: AnthropicStreamEvent[] = [];

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

async function readAnthropicStreamingResponse(
    response: Response,
    request: AgentRequest,
): Promise<{
    content: string;
    rawOutput: string;
    metadata: Record<string, unknown>;
}> {
    if (!response.body) {
        const rawText = await response.text();
        const payload = JSON.parse(rawText) as unknown;

        return {
            content: readAnthropicText(payload),
            rawOutput: rawText,
            metadata:
                payload && typeof payload === 'object'
                    ? (payload as Record<string, unknown>)
                    : {},
        };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let rawOutput = '';
    let content = '';
    let streamedContent = '';
    let finalMessage: Record<string, unknown> | null = null;
    let finalDelta: Record<string, unknown> | null = null;
    let usage: Record<string, unknown> | null = null;

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
            const type =
                typeof payload.type === 'string' ? payload.type : event.event;

            if (type === 'content_block_delta') {
                const delta =
                    payload.delta &&
                    typeof payload.delta === 'object' &&
                    !Array.isArray(payload.delta)
                        ? (payload.delta as Record<string, unknown>)
                        : null;
                const text =
                    delta &&
                    delta.type === 'text_delta' &&
                    typeof delta.text === 'string'
                        ? delta.text
                        : '';
                if (text) {
                    content += text;
                    streamedContent = emitTextStreamUpdate(
                        request,
                        content,
                        streamedContent,
                    );
                }
                continue;
            }

            if (type === 'message_start') {
                const message =
                    payload.message &&
                    typeof payload.message === 'object' &&
                    !Array.isArray(payload.message)
                        ? (payload.message as Record<string, unknown>)
                        : null;
                if (message) {
                    finalMessage = message;
                    const messageUsage =
                        message.usage &&
                        typeof message.usage === 'object' &&
                        !Array.isArray(message.usage)
                            ? (message.usage as Record<string, unknown>)
                            : null;
                    if (messageUsage) {
                        usage = messageUsage;
                    }
                }
                continue;
            }

            if (type === 'message_delta') {
                const delta =
                    payload.delta &&
                    typeof payload.delta === 'object' &&
                    !Array.isArray(payload.delta)
                        ? (payload.delta as Record<string, unknown>)
                        : null;
                if (delta) {
                    finalDelta = delta;
                }

                const payloadUsage =
                    payload.usage &&
                    typeof payload.usage === 'object' &&
                    !Array.isArray(payload.usage)
                        ? (payload.usage as Record<string, unknown>)
                        : null;
                if (payloadUsage) {
                    usage = payloadUsage;
                }
                continue;
            }

            if (type === 'error') {
                const errorPayload =
                    payload.error &&
                    typeof payload.error === 'object' &&
                    !Array.isArray(payload.error)
                        ? (payload.error as Record<string, unknown>)
                        : null;
                const message =
                    errorPayload && typeof errorPayload.message === 'string'
                        ? errorPayload.message
                        : 'Anthropic streaming request failed';
                throw new AgentExecutionError(message, {
                    agent: 'direct-api',
                    stderr: rawOutput,
                });
            }
        }
    }

    if (buffer.trim()) {
        rawOutput += decoder.decode();
        const parsed = parseSseEvents(buffer);
        for (const event of parsed.events) {
            if (event.data === '[DONE]') {
                continue;
            }
        }
    }

    return {
        content: content.trim(),
        rawOutput,
        metadata: {
            transport: 'anthropic_sse',
            ...(finalMessage ? { message: finalMessage } : {}),
            ...(finalDelta ? { delta: finalDelta } : {}),
            ...(usage ? { usage } : {}),
        },
    };
}

export class DirectApiAgentBackend implements AgentBackend {
    readonly type = 'api' as const;
    private readonly activeRuns = new Map<string, AbortController>();

    constructor(
        readonly name: string,
        private readonly config: ApiAgentPoolEntry,
    ) { }

    async execute(request: AgentRequest): Promise<AgentResponse> {
        const apiKey = process.env[this.config.api_key_env];
        if (!apiKey) {
            throw new AgentExecutionError(
                `Missing API key in env ${this.config.api_key_env}`,
                {
                    agent: this.name,
                },
            );
        }

        const controller = new AbortController();
        this.activeRuns.set(request.runId, controller);
        const startedAt = Date.now();

        try {
            const response = await fetch(this.config.endpoint, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({
                    model: this.config.model,
                    max_tokens: this.config.max_tokens,
                    stream: true,
                    system: request.systemPrompt,
                    messages: toAnthropicMessages(request.history, request.text),
                }),
                signal: controller.signal,
            });
            if (!response.ok) {
                const rawText = await response.text();
                throw new AgentExecutionError(
                    `Anthropic API returned ${response.status}`,
                    {
                        agent: this.name,
                        stderr: rawText,
                        exitCode: response.status,
                    },
                );
            }
            const streamedResponse = await readAnthropicStreamingResponse(
                response,
                request,
            );

            const responsePayload: AgentResponse = {
                content: streamedResponse.content,
                agent: this.name,
                duration: Date.now() - startedAt,
                rawOutput: streamedResponse.rawOutput,
            };

            if (Object.keys(streamedResponse.metadata).length > 0) {
                responsePayload.metadata = streamedResponse.metadata;
            }

            return responsePayload;
        } catch (error) {
            if (error instanceof AgentExecutionError) {
                throw error;
            }

            throw new AgentExecutionError(
                error instanceof Error
                    ? `Direct API request failed: ${error.message}`
                    : 'Direct API request failed',
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
        return Boolean(process.env[this.config.api_key_env]);
    }
}
