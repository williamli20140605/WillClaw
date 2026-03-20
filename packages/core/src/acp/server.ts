import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import type { Logger } from 'pino';
import { z } from 'zod';

import type { ChatMessage } from '../agents/types.js';
import type { AuthManager } from '../auth.js';
import type { ChatService, ChatServiceResult } from '../chat-service.js';
import { RunCancelledError } from '../chat-service.js';
import type { WillClawConfig } from '../config.js';
import type { WillClawEvent, WillClawEventHub } from '../events.js';

const ACP_AGENT_ID = 'willclaw';
const ACP_AGENT_NAME = 'WillClaw';
const ACP_CHANNEL = 'acp';
const ACP_USER_ID = 'acp-client';

const acpRunRequestSchema = z.object({
    mode: z.enum(['sync', 'stream', 'async']).default('sync'),
    conversation_id: z.string().optional(),
    input: z.object({
        system: z.string().optional(),
        messages: z
            .array(
                z.object({
                    role: z.enum(['user', 'assistant', 'system']),
                    content: z.union([
                        z.string(),
                        z.object({
                            text: z.string().optional(),
                        }).passthrough(),
                    ]),
                }),
            )
            .default([]),
    }),
});

export interface AcpServerRuntimeLike {
    config: WillClawConfig;
    logger: Logger;
    eventHub: WillClawEventHub;
    chatService: ChatService;
    authManager: AuthManager;
}

export interface AcpHttpServer {
    readonly hostname: string;
    readonly port: number;
    close(): Promise<void>;
}

interface AcpRunState {
    runId: string;
    agentId: string;
    conversationId: string;
    status: 'running' | 'completed' | 'failed' | 'cancelled';
    createdAt: string;
    updatedAt: string;
    result?: {
        content: string;
        agent: string;
        duration: number;
        metadata?: Record<string, unknown>;
    };
    error?: string;
}

function normalizeMessageContent(content: unknown): string {
    if (typeof content === 'string') {
        return content;
    }

    if (
        content &&
        typeof content === 'object' &&
        !Array.isArray(content) &&
        'text' in content &&
        typeof content.text === 'string'
    ) {
        return content.text;
    }

    return '';
}

function normalizeMessages(input: z.infer<typeof acpRunRequestSchema>['input']): {
    history: ChatMessage[];
    text: string;
} {
    const messages: ChatMessage[] = [];

    if (input.system?.trim()) {
        messages.push({
            role: 'system',
            content: input.system.trim(),
        });
    }

    for (const message of input.messages) {
        const content = normalizeMessageContent(message.content).trim();
        if (!content) {
            continue;
        }

        messages.push({
            role: message.role,
            content,
        });
    }

    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (message?.role === 'user') {
            return {
                history: messages.slice(0, index),
                text: message.content,
            };
        }
    }

    throw new Error('ACP run input must include at least one user message.');
}

function buildAgentDescriptor() {
    return {
        id: ACP_AGENT_ID,
        name: ACP_AGENT_NAME,
        description: 'WillClaw orchestration shell around configured coding agents.',
        modes: ['sync', 'stream', 'async'],
        capabilities: {
            streaming: true,
            async: true,
            cancellation: true,
            route_preview: true,
            memory: true,
            hosted_browser_screen: true,
        },
    };
}

function encodeSseEvent(event: string, payload: Record<string, unknown>): string {
    return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function toAcpRunResult(result: ChatServiceResult) {
    return {
        run_id: result.runId,
        status: 'completed',
        output: {
            content: result.content,
            agent: result.agent,
            duration_ms: result.duration,
        },
        metadata: result.metadata ?? {},
    };
}

export function createWillClawAcpApp(runtime: AcpServerRuntimeLike): Hono {
    const app = new Hono();
    const runs = new Map<string, AcpRunState>();
    const authManager = runtime.authManager;

    app.use('*', async (c, next) => {
        const authorization = authManager.authorize(c.req.raw, ['acp']);
        if (!authorization.ok) {
            return c.json(
                {
                    error:
                        authorization.error === 'insufficient_scope'
                            ? 'Forbidden'
                            : 'Unauthorized',
                },
                authorization.status,
            );
        }

        const limit = authManager.checkRateLimit(
            c.req.raw,
            'acp',
            authorization.identity,
        );
        if (!limit.allowed) {
            c.header('retry-after', String(limit.retryAfterSeconds));
            return c.json(
                {
                    error: 'Rate limit exceeded',
                    retryAfterSeconds: limit.retryAfterSeconds,
                },
                429,
            );
        }

        await next();
    });

    app.get('/agents', (c) => {
        return c.json({
            agents: [buildAgentDescriptor()],
        });
    });

    app.get('/agents/:agentId', (c) => {
        const agentId = c.req.param('agentId');
        if (agentId !== ACP_AGENT_ID) {
            return c.json({ error: 'ACP agent not found' }, 404);
        }

        return c.json(buildAgentDescriptor());
    });

    app.post('/agents/:agentId/run', async (c) => {
        const agentId = c.req.param('agentId');
        if (agentId !== ACP_AGENT_ID) {
            return c.json({ error: 'ACP agent not found' }, 404);
        }

        const payload = acpRunRequestSchema.parse(
            await c.req.json().catch(() => ({})),
        );
        const normalized = normalizeMessages(payload.input);
        const runId = randomUUID();
        const conversationId = payload.conversation_id?.trim() || runId;

        if (payload.mode === 'sync') {
            const result = await runtime.chatService.handleChat({
                runId,
                channel: ACP_CHANNEL,
                chatId: conversationId,
                userId: ACP_USER_ID,
                text: normalized.text,
                history: normalized.history,
                executionMode: 'foreground',
            });

            return c.json(toAcpRunResult(result));
        }

        if (payload.mode === 'async') {
            const state: AcpRunState = {
                runId,
                agentId,
                conversationId,
                status: 'running',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            runs.set(runId, state);

            void runtime.chatService
                .handleChat({
                    runId,
                    channel: ACP_CHANNEL,
                    chatId: conversationId,
                    userId: ACP_USER_ID,
                    text: normalized.text,
                    history: normalized.history,
                    executionMode: 'background',
                })
                .then((result) => {
                    const current = runs.get(runId);
                    if (!current) {
                        return;
                    }

                    current.status = 'completed';
                    current.updatedAt = new Date().toISOString();
                    current.result = {
                        content: result.content,
                        agent: result.agent,
                        duration: result.duration,
                        ...(result.metadata ? { metadata: result.metadata } : {}),
                    };
                })
                .catch((error) => {
                    const current = runs.get(runId);
                    if (!current) {
                        return;
                    }

                    const cancelled =
                        current.status === 'cancelled' ||
                        error instanceof RunCancelledError ||
                        (error instanceof Error &&
                            /cancelled/i.test(error.message));
                    current.status = cancelled ? 'cancelled' : 'failed';
                    current.updatedAt = new Date().toISOString();
                    current.error =
                        error instanceof Error ? error.message : 'ACP async run failed';
                });

            return c.json(
                {
                    run_id: runId,
                    status: 'running',
                    conversation_id: conversationId,
                },
                202,
            );
        }

        const encoder = new TextEncoder();

        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                let closed = false;

                const close = (cancelRun = false) => {
                    if (closed) {
                        return;
                    }

                    closed = true;
                    unsubscribe();
                    if (cancelRun) {
                        void runtime.chatService.cancelRun(runId, {
                            annotate: false,
                        });
                    }
                    controller.close();
                };

                const send = (event: string, payload: Record<string, unknown>) => {
                    if (closed) {
                        return;
                    }

                    controller.enqueue(encoder.encode(encodeSseEvent(event, payload)));
                };

                const unsubscribe = runtime.eventHub.subscribe((event: WillClawEvent) => {
                    if (event.payload.runId !== runId) {
                        return;
                    }

                    if (event.type === 'chat.run.stream.delta') {
                        send('delta', {
                            type: 'delta',
                            run_id: runId,
                            delta: {
                                text:
                                    typeof event.payload.delta === 'string'
                                        ? event.payload.delta
                                        : '',
                            },
                            content:
                                typeof event.payload.content === 'string'
                                    ? event.payload.content
                                    : '',
                            parser:
                                typeof event.payload.parser === 'string'
                                    ? event.payload.parser
                                    : 'plain_text',
                        });
                    }

                    if (event.type === 'chat.run.cancelled') {
                        send('error', {
                            type: 'error',
                            run_id: runId,
                            error:
                                typeof event.payload.error === 'string'
                                    ? event.payload.error
                                    : 'Run cancelled',
                        });
                        close(false);
                    }

                    if (event.type === 'chat.run.failed') {
                        send('error', {
                            type: 'error',
                            run_id: runId,
                            error:
                                typeof event.payload.error === 'string'
                                    ? event.payload.error
                                    : 'Run failed',
                        });
                        close(false);
                    }
                });

                send('start', {
                    type: 'start',
                    run_id: runId,
                    agent_id: agentId,
                    conversation_id: conversationId,
                });

                void runtime.chatService
                    .handleChat({
                        runId,
                        channel: ACP_CHANNEL,
                        chatId: conversationId,
                        userId: ACP_USER_ID,
                        text: normalized.text,
                        history: normalized.history,
                        executionMode: 'foreground',
                    })
                    .then((result) => {
                        send('done', {
                            type: 'done',
                            run_id: runId,
                            message: {
                                content: result.content,
                            },
                            output: {
                                content: result.content,
                                agent: result.agent,
                                duration_ms: result.duration,
                            },
                            metadata: result.metadata ?? {},
                        });
                        close(false);
                    })
                    .catch((error) => {
                        send('error', {
                            type: 'error',
                            run_id: runId,
                            error:
                                error instanceof Error
                                    ? error.message
                                    : 'ACP streaming run failed',
                        });
                        close(false);
                    });

                c.req.raw.signal.addEventListener('abort', () => close(true), {
                    once: true,
                });
            },
            cancel() {
                return;
            },
        });

        return new Response(stream, {
            headers: {
                'content-type': 'text/event-stream; charset=utf-8',
                'cache-control': 'no-cache, no-transform',
                connection: 'keep-alive',
            },
        });
    });

    app.get('/agents/:agentId/runs/:runId', (c) => {
        const agentId = c.req.param('agentId');
        const runId = c.req.param('runId');

        if (agentId !== ACP_AGENT_ID) {
            return c.json({ error: 'ACP agent not found' }, 404);
        }

        const state = runs.get(runId);
        if (!state) {
            return c.json({ error: 'ACP run not found' }, 404);
        }

        return c.json({
            run_id: state.runId,
            status: state.status,
            conversation_id: state.conversationId,
            created_at: state.createdAt,
            updated_at: state.updatedAt,
            ...(state.result
                ? {
                    output: {
                        content: state.result.content,
                        agent: state.result.agent,
                        duration_ms: state.result.duration,
                    },
                    metadata: state.result.metadata ?? {},
                }
                : {}),
            ...(state.error ? { error: state.error } : {}),
        });
    });

    app.post('/agents/:agentId/runs/:runId/cancel', async (c) => {
        const agentId = c.req.param('agentId');
        const runId = c.req.param('runId');

        if (agentId !== ACP_AGENT_ID) {
            return c.json({ error: 'ACP agent not found' }, 404);
        }

        const state = runs.get(runId);
        if (!state) {
            return c.json({ error: 'ACP run not found' }, 404);
        }

        const result = await runtime.chatService.cancelRun(runId, {
            annotate: false,
        });
        if (!result.cancelled) {
            return c.json({
                run_id: runId,
                status: state.status,
                cancelled: false,
            });
        }

        state.status = 'cancelled';
        state.updatedAt = new Date().toISOString();
        state.error = 'Cancelled by ACP client';

        return c.json({
            run_id: runId,
            status: 'cancelled',
            cancelled: true,
        });
    });

    app.onError((error) => {
        runtime.logger.error(
            {
                error: error instanceof Error ? error.message : String(error),
            },
            'ACP request failed',
        );

        return new Response(
            JSON.stringify({
                error: error instanceof Error ? error.message : 'Internal server error',
            }),
            {
                status: 500,
                headers: {
                    'content-type': 'application/json; charset=utf-8',
                },
            },
        );
    });

    return app;
}

export async function startWillClawAcpServer(
    runtime: AcpServerRuntimeLike,
    app: Hono,
): Promise<AcpHttpServer> {
    const host = runtime.config.server.host;
    const port = runtime.config.acp.server.port;
    const server = serve(
        {
            fetch: app.fetch,
            hostname: host,
            port,
        },
        (address) => {
            runtime.logger.info(
                {
                    host: address.address,
                    port: address.port,
                },
                'WillClaw ACP server listening',
            );
        },
    ) as Server;

    return {
        hostname: host,
        port,
        close: async () =>
            await new Promise<void>((resolve, reject) => {
                server.close((error) => {
                    if (error) {
                        reject(error);
                        return;
                    }

                    resolve();
                });
            }),
    };
}
