import type { Server } from 'node:http';

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import type { Logger } from 'pino';
import { z } from 'zod';

import type { ChatService } from './chat-service.js';
import { RunCancelledError } from './chat-service.js';
import type { WillClawConfig } from './config.js';
import type { BackgroundTaskEngine } from './heartbeat.js';
import type { MemoryStore } from './memory.js';
import type { Orchestrator } from './orchestrator.js';
import type { WillClawPaths } from './paths.js';
import type { PromptAssembler } from './prompt.js';
import type { WillClawScheduler } from './scheduler.js';
import { listHostTools } from './tool-catalog.js';
import type { ToolExecutionLogger } from './tool-logger.js';
import type { WorkspaceMemoryManager } from './workspace-memory.js';

const chatRequestSchema = z.object({
    text: z.string().min(1),
    history: z
        .array(
            z.object({
                role: z.enum(['user', 'assistant', 'system']),
                content: z.string(),
            }),
        )
        .optional(),
    isGroup: z.boolean().optional(),
    workingDirectory: z.string().optional(),
    executionMode: z.enum(['foreground', 'background']).optional(),
    currentMode: z.string().optional(),
    channel: z.string().optional(),
    chatId: z.string().optional(),
    userId: z.string().optional(),
});

const promptPreviewSchema = z.object({
    isGroup: z.boolean().optional(),
    currentMode: z.string().optional(),
    trigger: z.enum(['chat', 'heartbeat']).optional(),
});

const cancelRunSchema = z
    .object({
        annotate: z.boolean().optional(),
    })
    .optional();

const editMessageSchema = z.object({
    text: z.string().min(1),
    isGroup: z.boolean().optional(),
    workingDirectory: z.string().optional(),
    executionMode: z.enum(['foreground', 'background']).optional(),
    currentMode: z.string().optional(),
});

const resendMessageSchema = z
    .object({
        isGroup: z.boolean().optional(),
        workingDirectory: z.string().optional(),
        executionMode: z.enum(['foreground', 'background']).optional(),
        currentMode: z.string().optional(),
        channel: z.string().optional(),
        chatId: z.string().optional(),
        userId: z.string().optional(),
  })
  .optional();

const ensureDailyNoteSchema = z
  .object({
    date: z.string().optional(),
  })
  .optional();

const generateDailyNoteSchema = z
  .object({
    date: z.string().optional(),
    agentName: z.string().optional(),
    workingDirectory: z.string().optional(),
  })
  .optional();

const compactMemorySchema = z
  .object({
    agentName: z.string().optional(),
    workingDirectory: z.string().optional(),
    limit: z.coerce.number().int().positive().optional(),
  })
  .optional();

export interface WillClawRuntimeLike {
    config: WillClawConfig;
    paths: WillClawPaths;
    logger: Logger;
    promptAssembler: PromptAssembler;
    orchestrator: Orchestrator;
    memoryStore: MemoryStore;
    toolLogger: ToolExecutionLogger;
  chatService: ChatService;
  backgroundTaskEngine: BackgroundTaskEngine;
  scheduler: WillClawScheduler;
  workspaceMemoryManager: WorkspaceMemoryManager;
}

export interface WillClawHttpServer {
    readonly hostname: string;
    readonly port: number;
    close(): Promise<void>;
}

function shouldRequireAuth(config: WillClawConfig): boolean {
    return Boolean(
        config.server.auth_token && !config.server.auth_token.includes('${'),
    );
}

export function createWillClawApp(runtime: WillClawRuntimeLike): Hono {
    const app = new Hono();

    app.use('/api/*', async (c, next) => {
        if (!shouldRequireAuth(runtime.config)) {
            await next();
            return;
        }

        const authHeader = c.req.header('authorization');
        if (authHeader !== `Bearer ${runtime.config.server.auth_token}`) {
            return c.json({ error: 'Unauthorized' }, 401);
        }

        await next();
    });

    app.get('/health', (c) => {
        return c.json({ status: 'ok' });
    });

    app.get('/api/status', async (c) => {
        return c.json({
            name: 'WillClaw',
            homeDir: runtime.paths.homeDir,
            configPath: runtime.paths.configPath,
            server: {
                host: runtime.config.server.host,
                port: runtime.config.server.port,
            },
            hostTools: listHostTools(runtime.config),
            agents: await runtime.orchestrator.listAgents(),
        });
    });

    app.get('/api/agents', async (c) => {
        return c.json(await runtime.orchestrator.listAgents());
    });

    app.get('/api/tools/catalog', (c) => {
        const agentName = c.req.query('agent');

        return c.json({
            agent: agentName ?? null,
            tools: listHostTools(runtime.config, agentName),
        });
    });

    app.get('/api/messages', (c) => {
        const channel = c.req.query('channel') ?? 'web';
        const chatId = c.req.query('chatId') ?? 'default';
        const limit = Number(c.req.query('limit') ?? '50');
        const includeRevoked = c.req.query('includeRevoked') === 'true';

        return c.json(
            runtime.memoryStore.listMessages({
                channel,
                chatId,
                limit: Number.isFinite(limit) ? limit : 50,
                includeRevoked,
            }),
        );
    });

    app.get('/api/runs/:runId', (c) => {
        return c.json(runtime.chatService.getRunStatus(c.req.param('runId')));
    });

    app.post('/api/runs/:runId/cancel', async (c) => {
        const payload = cancelRunSchema.parse(await c.req.json().catch(() => ({})));
        const options: { annotate?: boolean } = {};
        if (payload?.annotate !== undefined) {
            options.annotate = payload.annotate;
        }

        const result = await runtime.chatService.cancelRun(
            c.req.param('runId'),
            options,
        );

        if (!result.run && !result.cancelled) {
            return c.json({ error: 'Run not found' }, 404);
        }

        return c.json(result);
    });

  app.get('/api/search', (c) => {
        const query = c.req.query('query') ?? '';
        const limit = Number(c.req.query('limit') ?? '20');
        const options: Parameters<MemoryStore['searchMessages']>[1] = {
            limit: Number.isFinite(limit) ? limit : 20,
        };

        const channel = c.req.query('channel');
        if (channel) {
            options.channel = channel;
        }

        const chatId = c.req.query('chatId');
        if (chatId) {
            options.chatId = chatId;
        }

    return c.json(runtime.memoryStore.searchMessages(query, options));
  });

  app.get('/api/memory/search', (c) => {
    const query = c.req.query('query') ?? '';
    const messageLimit = Number(c.req.query('messageLimit') ?? '10');
    const fileLimit = Number(c.req.query('fileLimit') ?? '10');
    const channel = c.req.query('channel');
    const chatId = c.req.query('chatId');
    const fileType = c.req.query('fileType');
    const options: Parameters<WorkspaceMemoryManager['search']>[1] = {
      messageLimit: Number.isFinite(messageLimit) ? messageLimit : 10,
      fileLimit: Number.isFinite(fileLimit) ? fileLimit : 10,
    };
    if (channel) {
      options.channel = channel;
    }
    if (chatId) {
      options.chatId = chatId;
    }
    if (fileType) {
      options.fileType = fileType;
    }

    return c.json(runtime.workspaceMemoryManager.search(query, options));
  });

  app.post('/api/memory/reindex', async (c) => {
    return c.json(await runtime.workspaceMemoryManager.reindexWorkspaceMemory());
  });

  app.post('/api/memory/daily-note/ensure', async (c) => {
    const payload = ensureDailyNoteSchema.parse(
      await c.req.json().catch(() => ({})),
    );
    const options: Parameters<WorkspaceMemoryManager['ensureDailyNote']>[0] = {};
    if (payload?.date) {
      options.date = payload.date;
    }

    return c.json(await runtime.workspaceMemoryManager.ensureDailyNote(options));
  });

  app.post('/api/memory/daily-note/generate', async (c) => {
    const payload = generateDailyNoteSchema.parse(
      await c.req.json().catch(() => ({})),
    );
    const options: Parameters<
      WorkspaceMemoryManager['generateDailyNote']
    >[0] = {};
    if (payload?.date) {
      options.date = payload.date;
    }
    if (payload?.agentName) {
      options.agentName = payload.agentName;
    }
    if (payload?.workingDirectory) {
      options.workingDirectory = payload.workingDirectory;
    }

    return c.json(
      await runtime.workspaceMemoryManager.generateDailyNote(options),
    );
  });

  app.post('/api/memory/compact', async (c) => {
    const payload = compactMemorySchema.parse(
      await c.req.json().catch(() => ({})),
    );
    const options: Parameters<WorkspaceMemoryManager['compactMemory']>[0] = {};
    if (payload?.agentName) {
      options.agentName = payload.agentName;
    }
    if (payload?.workingDirectory) {
      options.workingDirectory = payload.workingDirectory;
    }
    if (payload?.limit != null) {
      options.limit = payload.limit;
    }

    return c.json(await runtime.workspaceMemoryManager.compactMemory(options));
  });

  app.get('/api/cron', (c) => {
        return c.json({
            heartbeat: runtime.scheduler
                .listTasks()
                .find((task) => task.kind === 'heartbeat') ?? null,
            cron: runtime.scheduler
                .listTasks()
                .filter((task) => task.kind === 'cron'),
            definedCronTasks: runtime.backgroundTaskEngine.listCronTasks(),
        });
    });

    app.post('/api/heartbeat/run', async (c) => {
        return c.json(await runtime.scheduler.runHeartbeatNow());
    });

    app.post('/api/cron/:taskName/run', async (c) => {
        const taskName = c.req.param('taskName');
        return c.json(await runtime.scheduler.runCronNow(taskName));
    });

    app.get('/api/logs/tools', (c) => {
        const limit = Number(c.req.query('limit') ?? '100');
        const filters: Parameters<ToolExecutionLogger['list']>[0] = {
            limit: Number.isFinite(limit) ? limit : 100,
        };
        const tool = c.req.query('tool');
        const action = c.req.query('action');
        const agent = c.req.query('agent');
        const chatId = c.req.query('chatId');
        const from = c.req.query('from');
        const to = c.req.query('to');
        const success = c.req.query('success');

        if (tool) {
            filters.tool = tool;
        }

        if (action) {
            filters.action = action;
        }

        if (agent) {
            filters.agent = agent;
        }

        if (chatId) {
            filters.chatId = chatId;
        }

        if (from) {
            filters.from = from;
        }

        if (to) {
            filters.to = to;
        }

        if (success === 'true' || success === 'false') {
            filters.success = success === 'true';
        }

        return c.json(runtime.toolLogger.list(filters));
    });

    app.get('/api/logs/tools/stats', (c) => {
        return c.json(runtime.toolLogger.getStats());
    });

    app.get('/api/logs/tools/:id', (c) => {
        const id = Number(c.req.param('id'));
        if (!Number.isInteger(id) || id < 1) {
            return c.json({ error: 'Invalid tool log id' }, 400);
        }

        const entry = runtime.toolLogger.getById(id);
        if (!entry) {
            return c.json({ error: 'Tool log not found' }, 404);
        }

        return c.json(entry);
    });

    app.post('/api/prompt-preview', async (c) => {
        const payload = promptPreviewSchema.parse(await c.req.json());
        const promptOptions: NonNullable<
            Parameters<PromptAssembler['assembleSystemPrompt']>[0]
        > = {};

        if (payload.trigger) {
            promptOptions.trigger = payload.trigger;
        }

        if (payload.isGroup !== undefined) {
            promptOptions.isGroup = payload.isGroup;
        }

        if (payload.currentMode) {
            promptOptions.currentMode = payload.currentMode;
        }

        const preview =
            await runtime.promptAssembler.assembleSystemPrompt(promptOptions);

        return c.json(preview);
    });

    app.post('/api/chat', async (c) => {
        const payload = chatRequestSchema.parse(await c.req.json());
        const request: Parameters<ChatService['handleChat']>[0] = {
            text: payload.text,
        };

        if (payload.history) {
            request.history = payload.history;
        }

        if (payload.isGroup !== undefined) {
            request.isGroup = payload.isGroup;
        }

        if (payload.workingDirectory) {
            request.workingDirectory = payload.workingDirectory;
        }

        if (payload.executionMode) {
            request.executionMode = payload.executionMode;
        }

        if (payload.currentMode) {
            request.currentMode = payload.currentMode;
        }

        if (payload.channel) {
            request.channel = payload.channel;
        }

        if (payload.chatId) {
            request.chatId = payload.chatId;
        }

        if (payload.userId) {
            request.userId = payload.userId;
        }

        const result = await runtime.chatService.handleChat(request);

        return c.json(result);
    });

    app.post('/api/messages/:id/revoke', async (c) => {
        const id = Number(c.req.param('id'));
        if (!Number.isInteger(id) || id < 1) {
            return c.json({ error: 'Invalid message id' }, 400);
        }

        const result = await runtime.chatService.revokeMessage(id);
        if (!result) {
            return c.json({ error: 'Message not found' }, 404);
        }

        return c.json(result);
    });

    app.post('/api/messages/:id/edit', async (c) => {
        const id = Number(c.req.param('id'));
        if (!Number.isInteger(id) || id < 1) {
            return c.json({ error: 'Invalid message id' }, 400);
        }

        const payload = editMessageSchema.parse(await c.req.json());
        const request: Parameters<ChatService['editMessage']>[1] = {
            text: payload.text,
        };
        if (payload.isGroup !== undefined) {
            request.isGroup = payload.isGroup;
        }
        if (payload.workingDirectory) {
            request.workingDirectory = payload.workingDirectory;
        }
        if (payload.executionMode) {
            request.executionMode = payload.executionMode;
        }
        if (payload.currentMode) {
            request.currentMode = payload.currentMode;
        }

        const result = await runtime.chatService.editMessage(id, request);
        if (!result) {
            return c.json({ error: 'Message not found' }, 404);
        }

        return c.json(result);
    });

    app.post('/api/messages/:id/resend', async (c) => {
        const id = Number(c.req.param('id'));
        if (!Number.isInteger(id) || id < 1) {
            return c.json({ error: 'Invalid message id' }, 400);
        }

        const payload = resendMessageSchema.parse(
            await c.req.json().catch(() => ({})),
        );
        const request: NonNullable<Parameters<ChatService['resendMessage']>[1]> = {};
        if (payload?.isGroup !== undefined) {
            request.isGroup = payload.isGroup;
        }
        if (payload?.workingDirectory) {
            request.workingDirectory = payload.workingDirectory;
        }
        if (payload?.executionMode) {
            request.executionMode = payload.executionMode;
        }
        if (payload?.currentMode) {
            request.currentMode = payload.currentMode;
        }
        if (payload?.channel) {
            request.channel = payload.channel;
        }
        if (payload?.chatId) {
            request.chatId = payload.chatId;
        }
        if (payload?.userId) {
            request.userId = payload.userId;
        }

        const result = await runtime.chatService.resendMessage(id, request);
        if (!result) {
            return c.json({ error: 'Message not found' }, 404);
        }

        return c.json(result);
    });

    app.onError((error, c) => {
        if (error instanceof RunCancelledError) {
            return c.json(
                {
                    error: error.message,
                    code: 'run_cancelled',
                },
                409,
            );
        }

        runtime.logger.error(
            {
                error: error instanceof Error ? error.message : String(error),
            },
            'HTTP request failed',
        );

        return c.json(
            {
                error: error instanceof Error ? error.message : 'Internal server error',
            },
            500,
        );
    });

    return app;
}

export async function startWillClawHttpServer(
    runtime: WillClawRuntimeLike,
    app: Hono,
): Promise<WillClawHttpServer> {
    const server = serve(
        {
            fetch: app.fetch,
            hostname: runtime.config.server.host,
            port: runtime.config.server.port,
        },
        (address) => {
            runtime.logger.info(
                {
                    host: address.address,
                    port: address.port,
                },
                'WillClaw HTTP server listening',
            );
        },
    ) as Server;

    return {
        hostname: runtime.config.server.host,
        port: runtime.config.server.port,
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
