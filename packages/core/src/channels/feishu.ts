import { createHash, timingSafeEqual } from 'node:crypto';

import type { Logger } from 'pino';

import type { ChatService } from '../chat-service.js';
import type { FeishuChannelConfig } from '../config.js';
import type { MemoryStore } from '../memory.js';
import type { Orchestrator } from '../orchestrator.js';
import type { WillClawScheduler } from '../scheduler.js';

import { ChannelShellCommands } from './shell-commands.js';
import type { ChannelAdapter } from './types.js';

interface FeishuEnvelope<T> {
    code?: number;
    msg?: string;
    tenant_access_token?: string;
    expire?: number;
    data?: T;
}

interface FeishuTenantTokenData {
    tenant_access_token?: string;
    expire?: number;
}

interface FeishuEventHeader {
    event_id?: string;
    event_type?: string;
    token?: string;
}

interface FeishuSenderId {
    open_id?: string;
    user_id?: string;
    union_id?: string;
}

interface FeishuMessageEvent {
    sender?: {
        sender_id?: FeishuSenderId;
        sender_type?: string;
    };
    message?: {
        message_id?: string;
        chat_id?: string;
        chat_type?: 'p2p' | 'group' | 'topic_group';
        message_type?: string;
        content?: string;
        mentions?: Array<Record<string, unknown>>;
    };
}

interface FeishuWebhookPayload {
    type?: string;
    challenge?: string;
    token?: string;
    encrypt?: string;
    header?: FeishuEventHeader;
    event?: FeishuMessageEvent;
}

function splitFeishuText(content: string): string[] {
    const normalized = content.trim();
    if (!normalized) {
        return ['(empty response)'];
    }

    if (normalized.length <= 2_800) {
        return [normalized];
    }

    const chunks: string[] = [];
    let remaining = normalized;

    while (remaining.length > 0) {
        if (remaining.length <= 2_800) {
            chunks.push(remaining);
            break;
        }

        const slice = remaining.slice(0, 2_800);
        const breakAt = slice.lastIndexOf('\n');
        const boundary = breakAt > 1_400 ? breakAt : 2_800;
        chunks.push(remaining.slice(0, boundary));
        remaining = remaining.slice(boundary).trimStart();
    }

    return chunks;
}

function jsonResponse(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            'content-type': 'application/json; charset=utf-8',
        },
    });
}

function readTokenFromPayload(payload: FeishuWebhookPayload): string | undefined {
    if (typeof payload.header?.token === 'string' && payload.header.token.trim()) {
        return payload.header.token.trim();
    }

    if (typeof payload.token === 'string' && payload.token.trim()) {
        return payload.token.trim();
    }

    return undefined;
}

function constantTimeEquals(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    if (leftBuffer.length !== rightBuffer.length) {
        return false;
    }

    return timingSafeEqual(leftBuffer, rightBuffer);
}

function parseTextContent(rawContent: string | undefined): string | null {
    if (!rawContent) {
        return null;
    }

    try {
        const parsed = JSON.parse(rawContent) as unknown;
        if (
            parsed &&
            typeof parsed === 'object' &&
            !Array.isArray(parsed) &&
            'text' in parsed &&
            typeof parsed.text === 'string'
        ) {
            return parsed.text;
        }
    } catch {
        return rawContent;
    }

    return null;
}

function stripFeishuMentions(text: string): string {
    return text.replace(/<at\b[^>]*>.*?<\/at>/gis, ' ').replace(/\s+/g, ' ').trim();
}

export class FeishuChannel implements ChannelAdapter {
    readonly name = 'feishu';

    private readonly shellCommands: ChannelShellCommands;
    private tokenCache:
        | {
            value: string;
            expiresAt: number;
        }
        | undefined;
    private readonly processedEvents = new Map<string, number>();

    constructor(
        private readonly config: FeishuChannelConfig,
        private readonly chatService: ChatService,
        private readonly orchestrator: Orchestrator,
        private readonly scheduler: WillClawScheduler,
        private readonly memoryStore: MemoryStore,
        private readonly logger: Logger,
        private readonly workingDirectory: string,
    ) {
        this.shellCommands = new ChannelShellCommands(
            this.chatService,
            this.orchestrator,
            this.scheduler,
            this.memoryStore,
        );
    }

    async start(): Promise<boolean> {
        if (!this.getAppId() || !this.getAppSecret()) {
            this.logger.warn(
                {
                    channel: this.name,
                    appIdEnv: this.config.app_id_env,
                    appSecretEnv: this.config.app_secret_env,
                },
                'Feishu channel enabled but app credentials are missing; skipping channel startup',
            );
            return false;
        }

        try {
            await this.getTenantAccessToken();
        } catch (error) {
            this.logger.error(
                {
                    channel: this.name,
                    error: error instanceof Error ? error.message : String(error),
                },
                'Feishu channel failed credential validation during startup',
            );
            return false;
        }

        this.logger.info(
            {
                channel: this.name,
                route: '/api/channels/feishu/events',
            },
            'Feishu channel started',
        );
        return true;
    }

    async stop(): Promise<void> {
        this.tokenCache = undefined;
        this.processedEvents.clear();
    }

    async sendMessage(chatId: string, text: string): Promise<void> {
        for (const chunk of splitFeishuText(text)) {
            await this.sendChatMessage(chatId, chunk);
        }
    }

    async handleInboundRequest(request: Request): Promise<Response | null> {
        if (request.method.toUpperCase() !== 'POST') {
            return jsonResponse({ error: 'Method not allowed' }, 405);
        }

        const rawBody = await request.text().catch(() => '');
        const payload = (() => {
            try {
                return rawBody
                    ? (JSON.parse(rawBody) as FeishuWebhookPayload)
                    : null;
            } catch {
                return null;
            }
        })();
        if (!payload || typeof payload !== 'object') {
            return jsonResponse({ error: 'Invalid Feishu payload' }, 400);
        }

        if (!this.isSignatureValid(request, rawBody)) {
            return jsonResponse({ error: 'Invalid Feishu webhook signature' }, 401);
        }

        if (typeof payload.encrypt === 'string' && payload.encrypt.trim()) {
            return jsonResponse(
                {
                    error:
                        'Encrypted Feishu events are not supported yet. Disable event encryption for this app.',
                },
                501,
            );
        }

        if (payload.type === 'url_verification' && payload.challenge) {
            if (!this.isVerificationTokenValid(readTokenFromPayload(payload))) {
                return jsonResponse({ error: 'Invalid Feishu verification token' }, 401);
            }

            return jsonResponse({ challenge: payload.challenge });
        }

        if (payload.header?.event_type !== 'im.message.receive_v1') {
            return jsonResponse({ code: 0 });
        }

        if (!this.isVerificationTokenValid(readTokenFromPayload(payload))) {
            return jsonResponse({ error: 'Invalid Feishu verification token' }, 401);
        }

        const eventId = payload.header?.event_id;
        if (eventId && this.isDuplicateEvent(eventId)) {
            return jsonResponse({ code: 0 });
        }

        const event = payload.event;
        const message = event?.message;
        const sender = event?.sender;
        if (
            !message?.message_id ||
            !message.chat_id ||
            message.message_type !== 'text' ||
            sender?.sender_type === 'app'
        ) {
            return jsonResponse({ code: 0 });
        }

        const userId =
            sender?.sender_id?.open_id?.trim() ||
            sender?.sender_id?.user_id?.trim() ||
            '';
        const rawText = parseTextContent(message.content);
        if (!userId || !rawText) {
            return jsonResponse({ code: 0 });
        }

        if (!this.isAllowedUser(userId)) {
            this.logger.warn(
                {
                    channel: this.name,
                    userId,
                    chatId: message.chat_id,
                },
                'Ignoring Feishu message from unauthorized user',
            );
            return jsonResponse({ code: 0 });
        }

        if (!this.shouldHandleMessage(rawText, message)) {
            return jsonResponse({ code: 0 });
        }

        const text = stripFeishuMentions(rawText);
        if (!text) {
            return jsonResponse({ code: 0 });
        }

        try {
            const commandHandled = await this.shellCommands.handle({
                text,
                channel: this.name,
                chatId: message.chat_id,
                userId,
                isGroup: message.chat_type !== 'p2p',
                workingDirectory: this.workingDirectory,
                reply: async (content) => {
                    await this.replyToMessage(message.message_id!, content);
                },
            });
            if (commandHandled) {
                return jsonResponse({ code: 0 });
            }
        } catch (error) {
            this.logger.error(
                {
                    channel: this.name,
                    chatId: message.chat_id,
                    userId,
                    error: error instanceof Error ? error.message : String(error),
                },
                'Feishu command handling failed',
            );
            await this.replyToMessage(
                message.message_id,
                `WillClaw command error: ${error instanceof Error ? error.message : 'Unknown failure'}`,
            );
            return jsonResponse({ code: 0 });
        }

        try {
            const pendingAhead =
                this.chatService.listQueues({
                    channel: this.name,
                    chatId: message.chat_id,
                })[0]?.total ?? 0;
            const resultPromise = this.chatService.handleChat({
                text,
                channel: this.name,
                chatId: message.chat_id,
                userId,
                isGroup: message.chat_type !== 'p2p',
                workingDirectory: this.workingDirectory,
            });
            if (pendingAhead > 0) {
                await this.replyToMessage(
                    message.message_id,
                    `Queued behind ${pendingAhead} run(s). I will reply when it is your turn.`,
                );
            }
            const result = await resultPromise;

            await this.replyToMessage(message.message_id, result.content);
        } catch (error) {
            this.logger.error(
                {
                    channel: this.name,
                    chatId: message.chat_id,
                    userId,
                    error: error instanceof Error ? error.message : String(error),
                },
                'Feishu chat handling failed',
            );
            await this.replyToMessage(
                message.message_id,
                `WillClaw error: ${error instanceof Error ? error.message : 'Unknown failure'}`,
            );
        }

        return jsonResponse({ code: 0 });
    }

    private getAppId(): string | undefined {
        const value = process.env[this.config.app_id_env];
        return value?.trim() ? value.trim() : undefined;
    }

    private getAppSecret(): string | undefined {
        const value = process.env[this.config.app_secret_env];
        return value?.trim() ? value.trim() : undefined;
    }

    private getVerificationToken(): string | undefined {
        const value = process.env[this.config.verification_token_env];
        return value?.trim() ? value.trim() : undefined;
    }

    private getEncryptKey(): string | undefined {
        const value = process.env[this.config.encrypt_key_env];
        return value?.trim() ? value.trim() : undefined;
    }

    private getApiBaseUrl(): string {
        const maybeBaseUrl = (this.config as Record<string, unknown>).base_url;
        if (typeof maybeBaseUrl === 'string' && maybeBaseUrl.trim()) {
            return maybeBaseUrl.replace(/\/$/, '');
        }

        return 'https://open.feishu.cn/open-apis';
    }

    private isVerificationTokenValid(value: string | undefined): boolean {
        const configured = this.getVerificationToken();
        if (!configured) {
            return true;
        }

        return value === configured;
    }

    private isSignatureValid(request: Request, rawBody: string): boolean {
        const encryptKey = this.getEncryptKey();
        if (!encryptKey) {
            return true;
        }

        const timestamp = request.headers.get('x-lark-request-timestamp')?.trim();
        const nonce = request.headers.get('x-lark-request-nonce')?.trim();
        const signature = request.headers.get('x-lark-signature')?.trim();
        if (!timestamp || !nonce || !signature) {
            return false;
        }

        const digest = createHash('sha256')
            .update(timestamp)
            .update(nonce)
            .update(encryptKey)
            .update(rawBody)
            .digest('hex');

        return constantTimeEquals(digest, signature);
    }

    private isAllowedUser(userId: string): boolean {
        if (this.config.owner_open_id) {
            return (
                userId === this.config.owner_open_id ||
                this.config.allowed_open_ids.includes(userId)
            );
        }

        if (this.config.allowed_open_ids.length > 0) {
            return this.config.allowed_open_ids.includes(userId);
        }

        return true;
    }

    private shouldHandleMessage(
        rawText: string,
        message: NonNullable<FeishuMessageEvent['message']>,
    ): boolean {
        if (message.chat_type === 'p2p') {
            return true;
        }

        if (!this.config.require_mention_in_groups) {
            return true;
        }

        return Array.isArray(message.mentions) && message.mentions.length > 0
            ? true
            : /<at\b/i.test(rawText);
    }

    private isDuplicateEvent(eventId: string): boolean {
        const now = Date.now();

        for (const [storedEventId, expiresAt] of this.processedEvents.entries()) {
            if (expiresAt <= now) {
                this.processedEvents.delete(storedEventId);
            }
        }

        if (this.processedEvents.has(eventId)) {
            return true;
        }

        this.processedEvents.set(eventId, now + 10 * 60_000);
        return false;
    }

    private async getTenantAccessToken(): Promise<string> {
        const now = Date.now();
        if (
            this.tokenCache &&
            this.tokenCache.expiresAt > now + 60_000 &&
            this.tokenCache.value
        ) {
            return this.tokenCache.value;
        }

        const appId = this.getAppId();
        const appSecret = this.getAppSecret();
        if (!appId || !appSecret) {
            throw new Error('Missing Feishu app credentials.');
        }

        const response = await fetch(
            `${this.getApiBaseUrl()}/auth/v3/tenant_access_token/internal`,
            {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    app_id: appId,
                    app_secret: appSecret,
                }),
            },
        );
        const payload = (await response.json().catch(() => null)) as
            | FeishuEnvelope<FeishuTenantTokenData>
            | null;

        if (!response.ok || !payload) {
            throw new Error(`Feishu auth failed with status ${response.status}`);
        }

        if (payload.code && payload.code !== 0) {
            throw new Error(payload.msg || 'Feishu auth failed');
        }

        const token = payload.tenant_access_token ?? payload.data?.tenant_access_token;
        if (!token) {
            throw new Error('Feishu auth response did not include tenant_access_token');
        }

        const expireSeconds = payload.expire ?? payload.data?.expire ?? 7_200;
        this.tokenCache = {
            value: token,
            expiresAt: now + expireSeconds * 1_000,
        };

        return token;
    }

    private async sendChatMessage(chatId: string, text: string): Promise<void> {
        const token = await this.getTenantAccessToken();
        const response = await fetch(
            `${this.getApiBaseUrl()}/im/v1/messages?receive_id_type=chat_id`,
            {
                method: 'POST',
                headers: {
                    authorization: `Bearer ${token}`,
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    receive_id: chatId,
                    msg_type: 'text',
                    content: JSON.stringify({
                        text,
                    }),
                }),
            },
        );

        await this.assertOk(response, 'send Feishu chat message');
    }

    private async replyToMessage(messageId: string, text: string): Promise<void> {
        const token = await this.getTenantAccessToken();

        for (const chunk of splitFeishuText(text)) {
            const response = await fetch(
                `${this.getApiBaseUrl()}/im/v1/messages/${messageId}/reply`,
                {
                    method: 'POST',
                    headers: {
                        authorization: `Bearer ${token}`,
                        'content-type': 'application/json',
                    },
                    body: JSON.stringify({
                        msg_type: 'text',
                        content: JSON.stringify({
                            text: chunk,
                        }),
                    }),
                },
            );

            await this.assertOk(response, 'reply to Feishu message');
        }
    }

    private async assertOk(response: Response, action: string): Promise<void> {
        const payload = (await response.json().catch(() => null)) as
            | FeishuEnvelope<unknown>
            | null;

        if (!response.ok) {
            throw new Error(`Failed to ${action}: ${response.status}`);
        }

        if (payload?.code && payload.code !== 0) {
            throw new Error(payload.msg || `Failed to ${action}`);
        }
    }
}
