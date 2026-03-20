import { access, readFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import type { Logger } from 'pino';
import { z } from 'zod';

import { type AuthIdentity, type AuthManager } from './auth.js';
import type { ChatService } from './chat-service.js';
import type { ChannelManager } from './channels/manager.js';
import { RunCancelledError } from './chat-service.js';
import { AUTH_SCOPES, type AuthScope, type WillClawConfig } from './config.js';
import type { WillClawEvent, WillClawEventHub } from './events.js';
import type { BackgroundTaskEngine } from './heartbeat.js';
import type { MemoryStore } from './memory.js';
import type { Orchestrator } from './orchestrator.js';
import type { PairingChannel, PairingManager } from './pairing.js';
import type { WillClawPaths } from './paths.js';
import { getProviderHealth } from './provider-health.js';
import type { PromptAssembler } from './prompt.js';
import type { WillClawScheduler } from './scheduler.js';
import { listHostTools } from './tool-catalog.js';
import type { ToolExecutionLogger } from './tool-logger.js';
import type { BrowserTool } from './tools/browser.js';
import type { ScreenTool } from './tools/screen.js';
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

const authSessionRequestSchema = z
    .object({
        token: z.string().min(1).optional(),
    })
    .optional();

const authPairingRequestSchema = z.object({
    code: z.string().min(1),
});

const authTokenCreateSchema = z
    .object({
        id: z.string().min(1).optional(),
        scopes: z.array(z.enum(AUTH_SCOPES)).min(1).optional(),
    })
    .optional();

const pairingInviteCreateSchema = z.object({
    kind: z.enum(['web', 'channel']),
    ttlMinutes: z.coerce.number().int().positive().optional(),
    maxUses: z.coerce.number().int().positive().optional(),
    scopes: z.array(z.enum(AUTH_SCOPES)).optional(),
    channels: z.array(z.enum(['telegram', 'discord', 'feishu'])).optional(),
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

const browserContextSchema = z.object({
    chatId: z.string().optional(),
    browserApp: z.string().optional(),
    timeoutMs: z.coerce.number().int().positive().optional(),
    sessionName: z.string().optional(),
});

const browserOpenSchema = browserContextSchema.extend({
    target: z.string().min(1),
});

const browserSnapshotSchema = browserContextSchema.extend({
    interactive: z.boolean().optional(),
    compact: z.boolean().optional(),
    depth: z.coerce.number().int().positive().optional(),
    selector: z.string().optional(),
});

const browserInspectPageSchema = browserContextSchema.extend({
    target: z.string().min(1),
    interactive: z.boolean().optional(),
    compact: z.boolean().optional(),
    depth: z.coerce.number().int().positive().optional(),
    selector: z.string().optional(),
    screenshot: z.boolean().optional(),
    screenshotPath: z.string().optional(),
    fullPage: z.boolean().optional(),
});

const browserFillFormSchema = browserContextSchema.extend({
    target: z.string().min(1).optional(),
    fields: z
        .array(
            z.object({
                selector: z.string().min(1),
                text: z.string().min(1),
                clear: z.boolean().optional(),
            }),
        )
        .min(1),
    submitSelector: z.string().optional(),
    snapshotAfter: z.boolean().optional(),
    interactive: z.boolean().optional(),
    compact: z.boolean().optional(),
    depth: z.coerce.number().int().positive().optional(),
    selector: z.string().optional(),
    screenshot: z.boolean().optional(),
    screenshotPath: z.string().optional(),
    fullPage: z.boolean().optional(),
});

const browserClickSchema = browserContextSchema.extend({
    selector: z.string().min(1),
    newTab: z.boolean().optional(),
});

const browserTypeSchema = browserContextSchema.extend({
    text: z.string(),
    selector: z.string().optional(),
    clear: z.boolean().optional(),
});

const browserScreenshotSchema = browserContextSchema.extend({
    filePath: z.string().min(1),
    fullPage: z.boolean().optional(),
    annotate: z.boolean().optional(),
});

const screenContextSchema = z.object({
    chatId: z.string().optional(),
    timeoutMs: z.coerce.number().int().positive().optional(),
});

const screenCaptureSchema = screenContextSchema.extend({
    filePath: z.string().min(1),
    app: z.string().optional(),
    mode: z.enum(['screen', 'window', 'frontmost']).optional(),
    windowTitle: z.string().optional(),
    windowId: z.coerce.number().int().optional(),
    screenIndex: z.coerce.number().int().min(0).optional(),
    retina: z.boolean().optional(),
});

const screenSeeSchema = screenContextSchema.extend({
    app: z.string().optional(),
    mode: z.enum(['screen', 'window', 'frontmost']).optional(),
    path: z.string().optional(),
    windowTitle: z.string().optional(),
    windowId: z.coerce.number().int().optional(),
    screenIndex: z.coerce.number().int().min(0).optional(),
    annotate: z.boolean().optional(),
    analyze: z.string().optional(),
    timeoutSeconds: z.coerce.number().int().positive().optional(),
});

const screenClickSchema = screenContextSchema.extend({
    query: z.string().optional(),
    elementId: z.string().optional(),
    coords: z.string().optional(),
    app: z.string().optional(),
    windowTitle: z.string().optional(),
    windowId: z.coerce.number().int().optional(),
    snapshotId: z.string().optional(),
    double: z.boolean().optional(),
    right: z.boolean().optional(),
});

const screenTypeSchema = screenContextSchema.extend({
    text: z.string(),
    app: z.string().optional(),
    windowTitle: z.string().optional(),
    windowId: z.coerce.number().int().optional(),
    snapshotId: z.string().optional(),
    clear: z.boolean().optional(),
    pressReturn: z.boolean().optional(),
});

const screenPressSchema = screenContextSchema.extend({
    keys: z.array(z.string().min(1)).min(1),
    app: z.string().optional(),
    windowTitle: z.string().optional(),
    windowId: z.coerce.number().int().optional(),
    snapshotId: z.string().optional(),
    count: z.coerce.number().int().positive().optional(),
});

const screenOcrSchema = screenContextSchema.extend({
    filePath: z.string().optional(),
    app: z.string().optional(),
    mode: z.enum(['screen', 'window', 'frontmost']).optional(),
    windowTitle: z.string().optional(),
    windowId: z.coerce.number().int().optional(),
    screenIndex: z.coerce.number().int().min(0).optional(),
    retina: z.boolean().optional(),
    languages: z.array(z.string().min(1)).optional(),
});

const screenFrontmostAppSchema = screenContextSchema;

const screenOpenAppSchema = screenContextSchema.extend({
    app: z.string().min(1),
});

const screenActivateAppSchema = screenContextSchema.extend({
    app: z.string().min(1),
});

const screenInspectAppSchema = screenContextSchema.extend({
    app: z.string().min(1),
    filePath: z.string().optional(),
    waitMs: z.coerce.number().int().min(0).optional(),
    retina: z.boolean().optional(),
    languages: z.array(z.string().min(1)).optional(),
    launchIfNeeded: z.boolean().optional(),
});

type AppVariables = {
    authIdentity: AuthIdentity | null;
};

const WEB_DIST_DIR = fileURLToPath(
    new URL('../../web/dist', import.meta.url),
);

async function pathExists(targetPath: string): Promise<boolean> {
    try {
        await access(targetPath);
        return true;
    } catch {
        return false;
    }
}

function getAssetContentType(targetPath: string): string {
    const extension = path.extname(targetPath).toLowerCase();

    switch (extension) {
        case '.html':
            return 'text/html; charset=utf-8';
        case '.css':
            return 'text/css; charset=utf-8';
        case '.js':
            return 'application/javascript; charset=utf-8';
        case '.json':
        case '.map':
            return 'application/json; charset=utf-8';
        case '.svg':
            return 'image/svg+xml';
        default:
            return 'application/octet-stream';
    }
}

async function readWebAsset(
    assetPath: string,
): Promise<{ content: string; contentType: string } | null> {
    const normalized = path.normalize(assetPath).replace(/^(\.\.(\/|\\|$))+/, '');
    const filePath = path.join(WEB_DIST_DIR, normalized);

    if (!(await pathExists(filePath))) {
        return null;
    }

    return {
        content: await readFile(filePath, 'utf8'),
        contentType: getAssetContentType(filePath),
    };
}

export interface WillClawRuntimeLike {
    config: WillClawConfig;
    paths: WillClawPaths;
    logger: Logger;
    eventHub: WillClawEventHub;
    promptAssembler: PromptAssembler;
    orchestrator: Orchestrator;
    memoryStore: MemoryStore;
    toolLogger: ToolExecutionLogger;
    browserTool: BrowserTool;
    screenTool: ScreenTool;
    authManager: AuthManager;
    chatService: ChatService;
    channelManager: ChannelManager;
    pairingManager: PairingManager;
    backgroundTaskEngine: BackgroundTaskEngine;
    scheduler: WillClawScheduler;
    workspaceMemoryManager: WorkspaceMemoryManager;
}

export interface WillClawHttpServer {
    readonly hostname: string;
    readonly port: number;
    close(): Promise<void>;
}

function isPublicAuthRoute(pathname: string): boolean {
    return (
        pathname === '/api/auth/status' ||
        pathname === '/api/auth/session' ||
        pathname === '/api/auth/pairing'
    );
}

function getApiRequiredScopes(
    method: string,
    pathname: string,
): AuthScope[] | null {
    if (
        pathname === '/api/channels/feishu/events' ||
        isPublicAuthRoute(pathname)
    ) {
        return null;
    }

    if (
        pathname === '/api/auth/tokens' ||
        pathname === '/api/auth/sessions' ||
        pathname.startsWith('/api/auth/sessions/')
    ) {
        return ['api:session'];
    }

    if (pathname === '/api/events') {
        return ['api:events'];
    }

    if (pathname.startsWith('/api/tools/')) {
        return ['api:tools'];
    }

    if (method === 'GET' || method === 'HEAD') {
        return ['api:read'];
    }

    return ['api:write'];
}

function getApiRateLimitBucket(pathname: string): string {
    if (pathname === '/api/channels/feishu/events') {
        return 'feishu:webhook';
    }

    if (pathname === '/api/auth/status') {
        return 'auth:status';
    }

    if (pathname === '/api/auth/session') {
        return 'auth:session';
    }

    if (pathname === '/api/auth/pairing') {
        return 'auth:pairing';
    }

    if (pathname === '/api/auth/tokens') {
        return 'auth:tokens';
    }

    if (
        pathname === '/api/auth/sessions' ||
        pathname.startsWith('/api/auth/sessions/')
    ) {
        return 'auth:sessions';
    }

    if (pathname === '/api/events') {
        return 'api:events';
    }

    if (pathname.startsWith('/api/tools/')) {
        return 'api:tools';
    }

    return pathname.startsWith('/api/') ? 'api' : 'web';
}

function authErrorMessage(
    failure: ReturnType<AuthManager['authorize']>,
): string {
    switch (failure.error) {
        case 'insufficient_scope':
            return 'Forbidden';
        case 'invalid_credentials':
            return 'Invalid bearer token or session';
        default:
            return 'Unauthorized';
    }
}

function parseOptionalAuthSessionBody(
    request: Request,
): Promise<z.infer<typeof authSessionRequestSchema> | undefined> {
    return request
        .clone()
        .json()
        .then((payload) => authSessionRequestSchema.parse(payload))
        .catch(() => undefined);
}

function toSessionStatus(session: {
    tokenId: string;
    scopes: AuthScope[];
    expiresAt: string;
}, sessionCookieName: string): {
    authRequired: true;
    authenticated: true;
    sessionCookieName: string;
    scopes: AuthScope[];
    tokenId: string;
    source: 'session';
    expiresAt: string;
} {
    return {
        authRequired: true,
        authenticated: true,
        sessionCookieName,
        scopes: [...session.scopes],
        tokenId: session.tokenId,
        source: 'session',
        expiresAt: session.expiresAt,
    };
}

function encodeSseEvent(event: WillClawEvent): string {
    return `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

function buildBrowserToolContext(
    payload: z.infer<typeof browserContextSchema>,
): Parameters<BrowserTool['openUrl']>[1] {
    return {
        triggeredBy: 'web-ui',
        ...(payload.chatId ? { chatId: payload.chatId } : {}),
        ...(payload.browserApp ? { browserApp: payload.browserApp } : {}),
        ...(payload.timeoutMs !== undefined ? { timeoutMs: payload.timeoutMs } : {}),
        ...(payload.sessionName ? { sessionName: payload.sessionName } : {}),
    };
}

function buildScreenToolContext(
    payload: z.infer<typeof screenContextSchema>,
): Parameters<ScreenTool['capture']>[1] {
    return {
        triggeredBy: 'web-ui',
        ...(payload.chatId ? { chatId: payload.chatId } : {}),
        ...(payload.timeoutMs !== undefined ? { timeoutMs: payload.timeoutMs } : {}),
    };
}

export function createWillClawApp(runtime: WillClawRuntimeLike): Hono<{
    Variables: AppVariables;
}> {
    const app = new Hono<{
        Variables: AppVariables;
    }>();
    const authManager = runtime.authManager;

    app.use('/api/*', async (c, next) => {
        const requiredScopes = getApiRequiredScopes(c.req.method, c.req.path);
        if (requiredScopes === null) {
            const limit = authManager.checkRateLimit(
                c.req.raw,
                getApiRateLimitBucket(c.req.path),
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

            c.set('authIdentity', null);
            await next();
            return;
        }

        const authorization = authManager.authorize(
            c.req.raw,
            requiredScopes,
            {
                allowSession: true,
            },
        );
        if (!authorization.ok) {
            return c.json({ error: authErrorMessage(authorization) }, authorization.status);
        }

        const limit = authManager.checkRateLimit(
            c.req.raw,
            getApiRateLimitBucket(c.req.path),
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

        c.set('authIdentity', authorization.identity ?? null);
        await next();
    });

    app.get('/api/auth/status', (c) => {
        return c.json({
            ...authManager.getStatus(c.req.raw),
            pairingEnabled: runtime.pairingManager.isEnabled(),
        });
    });

    app.post('/api/auth/session', async (c) => {
        const payload = await parseOptionalAuthSessionBody(c.req.raw);
        const authorization = authManager.authorize(c.req.raw, ['api:session'], {
            allowSession: false,
            ...(payload?.token ? { bodyToken: payload.token } : {}),
        });
        if (!authorization.ok) {
            return c.json({ error: authErrorMessage(authorization) }, authorization.status);
        }

        const session = authManager.issueSession(c.req.raw, payload?.token);
        if (!session) {
            return c.json({ error: 'Unable to create session' }, 500);
        }

        c.header('set-cookie', authManager.buildSessionCookie(session, c.req.raw));
        return c.json(
            {
                ...toSessionStatus(session, authManager.getSessionCookieName()),
                pairingEnabled: runtime.pairingManager.isEnabled(),
            },
            201,
        );
    });

    app.post('/api/auth/pairing', async (c) => {
        if (!runtime.pairingManager.isEnabled()) {
            return c.json({ error: 'Pairing is disabled' }, 404);
        }

        const limit = authManager.checkRateLimit(
            c.req.raw,
            getApiRateLimitBucket(c.req.path),
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

        const payload = authPairingRequestSchema.parse(
            await c.req.json().catch(() => ({})),
        );
        const redeemed = await runtime.pairingManager.redeemWebInvite(payload.code);
        if (!redeemed) {
            return c.json({ error: 'Invalid or expired pairing code' }, 401);
        }

        const session = authManager.issueSessionForPairing({
            tokenId: redeemed.tokenId,
            scopes: redeemed.scopes,
        });
        if (!session) {
            return c.json({ error: 'Unable to create pairing session' }, 500);
        }

        c.header('set-cookie', authManager.buildSessionCookie(session, c.req.raw));
        return c.json(
            {
                ...toSessionStatus(session, authManager.getSessionCookieName()),
                pairingEnabled: runtime.pairingManager.isEnabled(),
                pairingInviteId: redeemed.inviteId,
            },
            201,
        );
    });

    app.delete('/api/auth/session', (c) => {
        authManager.destroySession(c.req.raw);
        c.header('set-cookie', authManager.buildClearingCookie(c.req.raw));
        return c.json({
            authRequired: authManager.isEnabled(),
            authenticated: false,
            sessionCookieName: authManager.getSessionCookieName(),
            scopes: [],
            pairingEnabled: runtime.pairingManager.isEnabled(),
        });
    });

    app.get('/api/auth/tokens', (c) => {
        return c.json({
            tokens: authManager.listTokens(),
        });
    });

    app.post('/api/auth/tokens', async (c) => {
        const payload = authTokenCreateSchema.parse(
            await c.req.json().catch(() => ({})),
        );

        const created = authManager.createManagedToken({
            ...(payload?.id ? { id: payload.id } : {}),
            ...(payload?.scopes ? { scopes: payload.scopes } : {}),
        });

        return c.json(created, 201);
    });

    app.delete('/api/auth/tokens/:tokenId', (c) => {
        const token = authManager.revokeTokenById(c.req.param('tokenId'));
        if (!token) {
            return c.json({ error: 'Managed auth token not found' }, 404);
        }

        return c.json({
            revoked: token,
        });
    });

    app.get('/api/auth/sessions', (c) => {
        return c.json({
            sessions: authManager.listSessions(),
        });
    });

    app.delete('/api/auth/sessions/:sessionId', (c) => {
        const session = authManager.revokeSessionById(c.req.param('sessionId'));
        if (!session) {
            return c.json({ error: 'Session not found' }, 404);
        }

        return c.json({
            revoked: session,
        });
    });

    app.get('/api/pairing', async (c) => {
        return c.json({
            enabled: runtime.pairingManager.isEnabled(),
            invites: await runtime.pairingManager.listInvites(),
            grants: await runtime.pairingManager.listGrants(),
        });
    });

    app.post('/api/pairing/invites', async (c) => {
        const payload = pairingInviteCreateSchema.parse(
            await c.req.json().catch(() => ({})),
        );
        const identity = c.get('authIdentity');
        const invite = await runtime.pairingManager.createInvite({
            kind: payload.kind,
            createdBy: identity?.tokenId ?? 'unknown',
            ...(payload.ttlMinutes !== undefined
                ? { ttlMinutes: payload.ttlMinutes }
                : {}),
            ...(payload.maxUses !== undefined
                ? { maxUses: payload.maxUses }
                : {}),
            ...(payload.scopes ? { scopes: payload.scopes } : {}),
            ...(payload.channels
                ? { channels: payload.channels as PairingChannel[] }
                : {}),
        });

        return c.json(invite, 201);
    });

    app.post('/api/pairing/invites/:inviteId/revoke', async (c) => {
        const invite = await runtime.pairingManager.revokeInvite(
            c.req.param('inviteId'),
        );
        if (!invite) {
            return c.json({ error: 'Pairing invite not found' }, 404);
        }

        return c.json(invite);
    });

    app.post('/api/pairing/grants/:grantId/revoke', async (c) => {
        const grant = await runtime.pairingManager.revokeGrant(
            c.req.param('grantId'),
        );
        if (!grant) {
            return c.json({ error: 'Pairing grant not found' }, 404);
        }

        return c.json(grant);
    });

    app.get('/health', (c) => {
        return c.json({ status: 'ok' });
    });

    app.get('/', async (c) => {
        const asset = await readWebAsset('index.html');
        if (!asset) {
            return c.text('WillClaw Web UI is not built yet. Run `pnpm build`.', 503);
        }

        return c.body(asset.content, 200, {
            'content-type': asset.contentType,
            'cache-control': 'no-cache',
        });
    });

    app.get('/styles.css', async (c) => {
        const asset = await readWebAsset('styles.css');
        if (!asset) {
            return c.text('Not found', 404);
        }

        return c.body(asset.content, 200, {
            'content-type': asset.contentType,
        });
    });

    app.get('/favicon.svg', async (c) => {
        const asset = await readWebAsset('favicon.svg');
        if (!asset) {
            return c.text('Not found', 404);
        }

        return c.body(asset.content, 200, {
            'content-type': asset.contentType,
        });
    });

    app.get('/assets/*', async (c) => {
        const asset = await readWebAsset(c.req.path.replace(/^\//, ''));
        if (!asset) {
            return c.text('Not found', 404);
        }

        return c.body(asset.content, 200, {
            'content-type': asset.contentType,
        });
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

    app.get('/api/providers/health', async (c) => {
        return c.json(await getProviderHealth(runtime.config));
    });

    app.post('/api/channels/feishu/events', async (c) => {
        const response = await runtime.channelManager.handleInboundRequest(
            'feishu',
            c.req.raw,
        );

        if (!response) {
            return c.json({ error: 'Feishu channel is not enabled' }, 404);
        }

        return response;
    });

    app.get('/api/route-preview', (c) => {
        const text = c.req.query('text') ?? '';
        if (!text.trim()) {
            return c.json({ error: 'Route preview text is required' }, 400);
        }

        const currentMode = c.req.query('currentMode') ?? undefined;
        return c.json(
            runtime.orchestrator.inspectRoute(text, {
                ...(currentMode ? { currentMode } : {}),
            }),
        );
    });

    app.get('/api/events', (c) => {
        const encoder = new TextEncoder();
        let closed = false;
        let keepalive: ReturnType<typeof setInterval> | undefined;
        let unsubscribe: (() => void) | undefined;

        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                const close = () => {
                    if (closed) {
                        return;
                    }

                    closed = true;
                    if (keepalive) {
                        clearInterval(keepalive);
                    }
                    if (unsubscribe) {
                        unsubscribe();
                    }
                    controller.close();
                };
                const send = (event: WillClawEvent) => {
                    if (closed) {
                        return;
                    }

                    controller.enqueue(encoder.encode(encodeSseEvent(event)));
                };

                unsubscribe = runtime.eventHub.subscribe(send);
                send({
                    id: 'connected',
                    type: 'ready',
                    timestamp: new Date().toISOString(),
                    payload: {
                        serverTime: new Date().toISOString(),
                    },
                });
                keepalive = setInterval(() => {
                    if (closed) {
                        return;
                    }

                    controller.enqueue(
                        encoder.encode(`: keepalive ${new Date().toISOString()}\n\n`),
                    );
                }, 15_000);
                c.req.raw.signal.addEventListener('abort', close, { once: true });
            },
            cancel() {
                closed = true;
                if (keepalive) {
                    clearInterval(keepalive);
                }
                if (unsubscribe) {
                    unsubscribe();
                }
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

    app.get('/api/tools/catalog', (c) => {
        const agentName = c.req.query('agent');

        return c.json({
            agent: agentName ?? null,
            tools: listHostTools(runtime.config, agentName),
        });
    });

    app.post('/api/tools/browser/open', async (c) => {
        const payload = browserOpenSchema.parse(
            await c.req.json().catch(() => ({})),
        );

        return c.json(
            await runtime.browserTool.openUrl(
                payload.target,
                buildBrowserToolContext(payload),
            ),
        );
    });

    app.post('/api/tools/browser/snapshot', async (c) => {
        const payload = browserSnapshotSchema.parse(
            await c.req.json().catch(() => ({})),
        );

        return c.json(
            await runtime.browserTool.snapshot(
                {
                    ...(payload.interactive !== undefined
                        ? { interactive: payload.interactive }
                        : {}),
                    ...(payload.compact !== undefined
                        ? { compact: payload.compact }
                        : {}),
                    ...(payload.depth !== undefined ? { depth: payload.depth } : {}),
                    ...(payload.selector ? { selector: payload.selector } : {}),
                },
                buildBrowserToolContext(payload),
            ),
        );
    });

    app.post('/api/tools/browser/inspect-page', async (c) => {
        const payload = browserInspectPageSchema.parse(
            await c.req.json().catch(() => ({})),
        );

        return c.json(
            await runtime.browserTool.inspectPage(
                {
                    target: payload.target,
                    ...(payload.interactive !== undefined
                        ? { interactive: payload.interactive }
                        : {}),
                    ...(payload.compact !== undefined
                        ? { compact: payload.compact }
                        : {}),
                    ...(payload.depth !== undefined ? { depth: payload.depth } : {}),
                    ...(payload.selector ? { selector: payload.selector } : {}),
                    ...(payload.screenshot !== undefined
                        ? { screenshot: payload.screenshot }
                        : {}),
                    ...(payload.screenshotPath
                        ? { screenshotPath: payload.screenshotPath }
                        : {}),
                    ...(payload.fullPage !== undefined
                        ? { fullPage: payload.fullPage }
                        : {}),
                },
                buildBrowserToolContext(payload),
            ),
        );
    });

    app.post('/api/tools/browser/fill-form', async (c) => {
        const payload = browserFillFormSchema.parse(
            await c.req.json().catch(() => ({})),
        );

        return c.json(
            await runtime.browserTool.fillForm(
                {
                    ...(payload.target ? { target: payload.target } : {}),
                    fields: payload.fields.map((field) => ({
                        selector: field.selector,
                        text: field.text,
                        ...(field.clear !== undefined ? { clear: field.clear } : {}),
                    })),
                    ...(payload.submitSelector
                        ? { submitSelector: payload.submitSelector }
                        : {}),
                    ...(payload.snapshotAfter !== undefined
                        ? { snapshotAfter: payload.snapshotAfter }
                        : {}),
                    ...(payload.interactive !== undefined
                        ? { interactive: payload.interactive }
                        : {}),
                    ...(payload.compact !== undefined
                        ? { compact: payload.compact }
                        : {}),
                    ...(payload.depth !== undefined ? { depth: payload.depth } : {}),
                    ...(payload.selector ? { selector: payload.selector } : {}),
                    ...(payload.screenshot !== undefined
                        ? { screenshot: payload.screenshot }
                        : {}),
                    ...(payload.screenshotPath
                        ? { screenshotPath: payload.screenshotPath }
                        : {}),
                    ...(payload.fullPage !== undefined
                        ? { fullPage: payload.fullPage }
                        : {}),
                },
                buildBrowserToolContext(payload),
            ),
        );
    });

    app.post('/api/tools/browser/click', async (c) => {
        const payload = browserClickSchema.parse(
            await c.req.json().catch(() => ({})),
        );

        return c.json(
            await runtime.browserTool.click(
                {
                    selector: payload.selector,
                    ...(payload.newTab !== undefined
                        ? { newTab: payload.newTab }
                        : {}),
                },
                buildBrowserToolContext(payload),
            ),
        );
    });

    app.post('/api/tools/browser/type', async (c) => {
        const payload = browserTypeSchema.parse(
            await c.req.json().catch(() => ({})),
        );

        return c.json(
            await runtime.browserTool.type(
                {
                    text: payload.text,
                    ...(payload.selector ? { selector: payload.selector } : {}),
                    ...(payload.clear !== undefined
                        ? { clear: payload.clear }
                        : {}),
                },
                buildBrowserToolContext(payload),
            ),
        );
    });

    app.post('/api/tools/browser/screenshot', async (c) => {
        const payload = browserScreenshotSchema.parse(
            await c.req.json().catch(() => ({})),
        );

        return c.json(
            await runtime.browserTool.screenshot(
                {
                    filePath: payload.filePath,
                    ...(payload.fullPage !== undefined
                        ? { fullPage: payload.fullPage }
                        : {}),
                    ...(payload.annotate !== undefined
                        ? { annotate: payload.annotate }
                        : {}),
                },
                buildBrowserToolContext(payload),
            ),
        );
    });

    app.post('/api/tools/screen/capture', async (c) => {
        const payload = screenCaptureSchema.parse(
            await c.req.json().catch(() => ({})),
        );

        return c.json(
            await runtime.screenTool.capture(
                {
                    filePath: payload.filePath,
                    ...(payload.app ? { app: payload.app } : {}),
                    ...(payload.mode ? { mode: payload.mode } : {}),
                    ...(payload.windowTitle
                        ? { windowTitle: payload.windowTitle }
                        : {}),
                    ...(payload.windowId !== undefined
                        ? { windowId: payload.windowId }
                        : {}),
                    ...(payload.screenIndex !== undefined
                        ? { screenIndex: payload.screenIndex }
                        : {}),
                    ...(payload.retina !== undefined
                        ? { retina: payload.retina }
                        : {}),
                },
                buildScreenToolContext(payload),
            ),
        );
    });

    app.post('/api/tools/screen/see', async (c) => {
        const payload = screenSeeSchema.parse(
            await c.req.json().catch(() => ({})),
        );

        return c.json(
            await runtime.screenTool.see(
                {
                    ...(payload.app ? { app: payload.app } : {}),
                    ...(payload.mode ? { mode: payload.mode } : {}),
                    ...(payload.path ? { path: payload.path } : {}),
                    ...(payload.windowTitle
                        ? { windowTitle: payload.windowTitle }
                        : {}),
                    ...(payload.windowId !== undefined
                        ? { windowId: payload.windowId }
                        : {}),
                    ...(payload.screenIndex !== undefined
                        ? { screenIndex: payload.screenIndex }
                        : {}),
                    ...(payload.annotate !== undefined
                        ? { annotate: payload.annotate }
                        : {}),
                    ...(payload.analyze ? { analyze: payload.analyze } : {}),
                    ...(payload.timeoutSeconds !== undefined
                        ? { timeoutSeconds: payload.timeoutSeconds }
                        : {}),
                },
                buildScreenToolContext(payload),
            ),
        );
    });

    app.post('/api/tools/screen/click', async (c) => {
        const payload = screenClickSchema.parse(
            await c.req.json().catch(() => ({})),
        );

        return c.json(
            await runtime.screenTool.click(
                {
                    ...(payload.query ? { query: payload.query } : {}),
                    ...(payload.elementId ? { elementId: payload.elementId } : {}),
                    ...(payload.coords ? { coords: payload.coords } : {}),
                    ...(payload.app ? { app: payload.app } : {}),
                    ...(payload.windowTitle
                        ? { windowTitle: payload.windowTitle }
                        : {}),
                    ...(payload.windowId !== undefined
                        ? { windowId: payload.windowId }
                        : {}),
                    ...(payload.snapshotId
                        ? { snapshotId: payload.snapshotId }
                        : {}),
                    ...(payload.double !== undefined
                        ? { double: payload.double }
                        : {}),
                    ...(payload.right !== undefined
                        ? { right: payload.right }
                        : {}),
                },
                buildScreenToolContext(payload),
            ),
        );
    });

    app.post('/api/tools/screen/type', async (c) => {
        const payload = screenTypeSchema.parse(
            await c.req.json().catch(() => ({})),
        );

        return c.json(
            await runtime.screenTool.type(
                {
                    text: payload.text,
                    ...(payload.app ? { app: payload.app } : {}),
                    ...(payload.windowTitle
                        ? { windowTitle: payload.windowTitle }
                        : {}),
                    ...(payload.windowId !== undefined
                        ? { windowId: payload.windowId }
                        : {}),
                    ...(payload.snapshotId
                        ? { snapshotId: payload.snapshotId }
                        : {}),
                    ...(payload.clear !== undefined
                        ? { clear: payload.clear }
                        : {}),
                    ...(payload.pressReturn !== undefined
                        ? { pressReturn: payload.pressReturn }
                        : {}),
                },
                buildScreenToolContext(payload),
            ),
        );
    });

    app.post('/api/tools/screen/press', async (c) => {
        const payload = screenPressSchema.parse(
            await c.req.json().catch(() => ({})),
        );

        return c.json(
            await runtime.screenTool.press(
                {
                    keys: payload.keys,
                    ...(payload.app ? { app: payload.app } : {}),
                    ...(payload.windowTitle
                        ? { windowTitle: payload.windowTitle }
                        : {}),
                    ...(payload.windowId !== undefined
                        ? { windowId: payload.windowId }
                        : {}),
                    ...(payload.snapshotId
                        ? { snapshotId: payload.snapshotId }
                        : {}),
                    ...(payload.count !== undefined
                        ? { count: payload.count }
                        : {}),
                },
                buildScreenToolContext(payload),
            ),
        );
    });

    app.post('/api/tools/screen/ocr', async (c) => {
        const payload = screenOcrSchema.parse(
            await c.req.json().catch(() => ({})),
        );

        return c.json(
            await runtime.screenTool.ocr(
                {
                    ...(payload.filePath ? { filePath: payload.filePath } : {}),
                    ...(payload.app ? { app: payload.app } : {}),
                    ...(payload.mode ? { mode: payload.mode } : {}),
                    ...(payload.windowTitle
                        ? { windowTitle: payload.windowTitle }
                        : {}),
                    ...(payload.windowId !== undefined
                        ? { windowId: payload.windowId }
                        : {}),
                    ...(payload.screenIndex !== undefined
                        ? { screenIndex: payload.screenIndex }
                        : {}),
                    ...(payload.retina !== undefined
                        ? { retina: payload.retina }
                        : {}),
                    ...(payload.languages ? { languages: payload.languages } : {}),
                },
                buildScreenToolContext(payload),
            ),
        );
    });

    app.post('/api/tools/screen/frontmost-app', async (c) => {
        const payload = screenFrontmostAppSchema.parse(
            await c.req.json().catch(() => ({})),
        );

        return c.json(
            await runtime.screenTool.frontmostApp(
                buildScreenToolContext(payload),
            ),
        );
    });

    app.post('/api/tools/screen/open-app', async (c) => {
        const payload = screenOpenAppSchema.parse(
            await c.req.json().catch(() => ({})),
        );

        return c.json(
            await runtime.screenTool.openApp(
                {
                    app: payload.app,
                },
                buildScreenToolContext(payload),
            ),
        );
    });

    app.post('/api/tools/screen/activate-app', async (c) => {
        const payload = screenActivateAppSchema.parse(
            await c.req.json().catch(() => ({})),
        );

        return c.json(
            await runtime.screenTool.activateApp(
                {
                    app: payload.app,
                },
                buildScreenToolContext(payload),
            ),
        );
    });

    app.post('/api/tools/screen/inspect-app', async (c) => {
        const payload = screenInspectAppSchema.parse(
            await c.req.json().catch(() => ({})),
        );

        return c.json(
            await runtime.screenTool.inspectApp(
                {
                    app: payload.app,
                    ...(payload.filePath ? { filePath: payload.filePath } : {}),
                    ...(payload.waitMs !== undefined
                        ? { waitMs: payload.waitMs }
                        : {}),
                    ...(payload.retina !== undefined
                        ? { retina: payload.retina }
                        : {}),
                    ...(payload.languages ? { languages: payload.languages } : {}),
                    ...(payload.launchIfNeeded !== undefined
                        ? { launchIfNeeded: payload.launchIfNeeded }
                        : {}),
                },
                buildScreenToolContext(payload),
            ),
        );
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

    app.get('/api/chats', (c) => {
        const channel = c.req.query('channel');
        const limit = Number(c.req.query('limit') ?? '24');
        const includeRevoked = c.req.query('includeRevoked') === 'true';

        return c.json(
            runtime.memoryStore.listChats({
                ...(channel ? { channel } : {}),
                limit: Number.isFinite(limit) ? limit : 24,
                includeRevoked,
            }),
        );
    });

    app.get('/api/queues', (c) => {
        const channel = c.req.query('channel');
        const chatId = c.req.query('chatId');

        return c.json(
            runtime.chatService.listQueues({
                ...(channel ? { channel } : {}),
                ...(chatId ? { chatId } : {}),
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
    const from = c.req.query('from');
    const to = c.req.query('to');
    const filepathLike = c.req.query('filepathLike');
    const excludeRunId = c.req.query('excludeRunId');
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
    if (from) {
      options.from = from;
    }
    if (to) {
      options.to = to;
    }
    if (filepathLike) {
      options.filepathLike = filepathLike;
    }
    if (excludeRunId) {
      options.excludeRunId = excludeRunId;
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
        const tasks = runtime.scheduler.listTasks();

        return c.json({
            heartbeat: tasks.find((task) => task.kind === 'heartbeat') ?? null,
            cron: tasks.filter((task) => task.kind === 'cron'),
            maintenance: tasks.filter((task) => task.kind === 'maintenance'),
            definedCronTasks: runtime.backgroundTaskEngine.listCronTasks(),
            memoryMaintenance: runtime.workspaceMemoryManager.listMaintenanceTasks(),
        });
    });

    app.post('/api/heartbeat/run', async (c) => {
        return c.json(await runtime.scheduler.runHeartbeatNow());
    });

    app.post('/api/cron/:taskName/run', async (c) => {
        const taskName = c.req.param('taskName');
        return c.json(await runtime.scheduler.runCronNow(taskName));
    });

    app.post('/api/maintenance/:taskName/run', async (c) => {
        const taskName = c.req.param('taskName');
        if (taskName !== 'daily_note' && taskName !== 'compact') {
            return c.json({ error: 'Unknown maintenance task' }, 404);
        }

        return c.json(await runtime.scheduler.runMaintenanceNow(taskName));
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
    app: Hono<{ Variables: AppVariables }>,
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
