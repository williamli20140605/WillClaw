import { randomUUID, timingSafeEqual } from 'node:crypto';

import type { AuthScope, WillClawConfig } from './config.js';
import { AUTH_SCOPES } from './config.js';

const ALL_SCOPES = [...AUTH_SCOPES];

export interface AuthIdentity {
    tokenId: string;
    scopes: AuthScope[];
    source: 'bearer' | 'session';
    legacy: boolean;
}

export interface AuthSession {
    id: string;
    tokenId: string;
    scopes: AuthScope[];
    expiresAt: string;
    createdAt: string;
}

export interface AuthStatusPayload {
    authRequired: boolean;
    authenticated: boolean;
    sessionCookieName: string;
    scopes: AuthScope[];
    pairingEnabled?: boolean;
    tokenId?: string;
    source?: AuthIdentity['source'];
    expiresAt?: string;
}

interface ResolvedAuthToken {
    id: string;
    token: string;
    scopes: AuthScope[];
    legacy: boolean;
}

interface SessionRecord {
    id: string;
    tokenId: string;
    scopes: AuthScope[];
    createdAt: number;
    expiresAt: number;
}

interface RateLimitBucket {
    startedAt: number;
    count: number;
}

export interface AuthAuthorization {
    ok: boolean;
    identity?: AuthIdentity;
    status: 200 | 401 | 403;
    error?: 'missing_credentials' | 'invalid_credentials' | 'insufficient_scope';
}

export interface RateLimitResult {
    allowed: boolean;
    limit: number;
    remaining: number;
    retryAfterSeconds: number;
}

function isResolvedToken(token: string | undefined): token is string {
    return Boolean(token && token.trim() && !token.includes('${'));
}

function dedupeScopes(scopes: Iterable<AuthScope>): AuthScope[] {
    return Array.from(new Set(scopes));
}

function parseBearerToken(header: string | null | undefined): string | null {
    if (!header) {
        return null;
    }

    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match?.[1]) {
        return null;
    }

    return match[1].trim() || null;
}

function parseCookies(header: string | null | undefined): Map<string, string> {
    const cookies = new Map<string, string>();
    if (!header) {
        return cookies;
    }

    for (const chunk of header.split(';')) {
        const [rawName, ...rawValue] = chunk.split('=');
        const name = rawName?.trim();
        if (!name) {
            continue;
        }

        cookies.set(name, decodeURIComponent(rawValue.join('=').trim()));
    }

    return cookies;
}

function constantTimeEquals(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    if (leftBuffer.length !== rightBuffer.length) {
        return false;
    }

    return timingSafeEqual(leftBuffer, rightBuffer);
}

function serializeCookie(
    name: string,
    value: string,
    options?: {
        maxAgeSeconds?: number;
        expiresAt?: Date;
        httpOnly?: boolean;
        path?: string;
        sameSite?: 'Lax' | 'Strict' | 'None';
        secure?: boolean;
    },
): string {
    const parts = [`${name}=${encodeURIComponent(value)}`];
    parts.push(`Path=${options?.path ?? '/'}`);

    if (options?.httpOnly !== false) {
        parts.push('HttpOnly');
    }

    parts.push(`SameSite=${options?.sameSite ?? 'Lax'}`);

    if (options?.secure) {
        parts.push('Secure');
    }

    if (options?.maxAgeSeconds !== undefined) {
        parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`);
    }

    if (options?.expiresAt) {
        parts.push(`Expires=${options.expiresAt.toUTCString()}`);
    }

    return parts.join('; ');
}

function buildConfiguredTokens(config: WillClawConfig): ResolvedAuthToken[] {
    const configured: ResolvedAuthToken[] = [];

    if (isResolvedToken(config.server.auth_token)) {
        configured.push({
            id: 'legacy-owner',
            token: config.server.auth_token,
            scopes: [...ALL_SCOPES],
            legacy: true,
        });
    }

    for (const token of config.server.auth.tokens) {
        if (!isResolvedToken(token.token)) {
            continue;
        }

        configured.push({
            id: token.id,
            token: token.token,
            scopes: dedupeScopes(token.scopes),
            legacy: false,
        });
    }

    return configured;
}

function defaultIdentity(match: ResolvedAuthToken, source: AuthIdentity['source']): AuthIdentity {
    return {
        tokenId: match.id,
        scopes: [...match.scopes],
        source,
        legacy: match.legacy,
    };
}

function getRequestIp(request: Request): string {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) {
        return forwarded.split(',')[0]?.trim() || 'unknown';
    }

    const realIp = request.headers.get('x-real-ip');
    if (realIp?.trim()) {
        return realIp.trim();
    }

    return 'local';
}

export class AuthManager {
    private readonly tokens: ResolvedAuthToken[];
    private readonly sessions = new Map<string, SessionRecord>();
    private readonly rateLimits = new Map<string, RateLimitBucket>();
    private readonly sessionCookieName: string;
    private readonly sessionTtlMs: number;
    private readonly rateLimitEnabled: boolean;
    private readonly rateLimitWindowMs: number;
    private readonly rateLimitMaxRequests: number;

    constructor(private readonly config: WillClawConfig) {
        this.tokens = buildConfiguredTokens(config);
        this.sessionCookieName = config.server.auth.session.cookie_name;
        this.sessionTtlMs =
            config.server.auth.session.ttl_hours * 60 * 60 * 1000;
        this.rateLimitEnabled = config.server.auth.rate_limit.enabled;
        this.rateLimitWindowMs =
            config.server.auth.rate_limit.window_seconds * 1000;
        this.rateLimitMaxRequests = config.server.auth.rate_limit.max_requests;
    }

    isEnabled(): boolean {
        return this.tokens.length > 0;
    }

    getSessionCookieName(): string {
        return this.sessionCookieName;
    }

    getStatus(request: Request): AuthStatusPayload {
        if (!this.isEnabled()) {
            return {
                authRequired: false,
                authenticated: true,
                sessionCookieName: this.sessionCookieName,
                scopes: [...ALL_SCOPES],
            };
        }

        const identity = this.resolveIdentity(request, {
            allowSession: true,
        });

        if (!identity) {
            return {
                authRequired: true,
                authenticated: false,
                sessionCookieName: this.sessionCookieName,
                scopes: [],
            };
        }

        const session = this.resolveSession(request);
        return {
            authRequired: true,
            authenticated: true,
            sessionCookieName: this.sessionCookieName,
            scopes: [...identity.scopes],
            tokenId: identity.tokenId,
            source: identity.source,
            ...(session ? { expiresAt: new Date(session.expiresAt).toISOString() } : {}),
        };
    }

    authorize(
        request: Request,
        requiredScopes: AuthScope[],
        options?: {
            allowSession?: boolean;
            bodyToken?: string | null | undefined;
        },
    ): AuthAuthorization {
        if (!this.isEnabled()) {
            return {
                ok: true,
                status: 200,
            };
        }

        const identity = this.resolveIdentity(request, options);
        if (!identity) {
            const hadToken =
                Boolean(options?.bodyToken?.trim()) ||
                Boolean(parseBearerToken(request.headers.get('authorization')));

            return {
                ok: false,
                status: 401,
                error: hadToken ? 'invalid_credentials' : 'missing_credentials',
            };
        }

        const hasScopes = requiredScopes.every((scope) =>
            identity.scopes.includes(scope),
        );
        if (!hasScopes) {
            return {
                ok: false,
                status: 403,
                error: 'insufficient_scope',
                identity,
            };
        }

        return {
            ok: true,
            identity,
            status: 200,
        };
    }

    issueSession(
        request: Request,
        bodyToken?: string | null,
    ): AuthSession | null {
        if (!this.isEnabled()) {
            return null;
        }

        const authorization = this.authorize(request, ['api:session'], {
            allowSession: false,
            ...(bodyToken !== undefined ? { bodyToken } : {}),
        });
        if (!authorization.ok || !authorization.identity) {
            return null;
        }

        const scopes = authorization.identity.scopes.filter(
            (scope) => scope !== 'api:session',
        );
        const normalizedScopes: AuthScope[] =
            scopes.length > 0 ? dedupeScopes(scopes) : ['api:read'];

        return this.createSessionRecord({
            tokenId: authorization.identity.tokenId,
            scopes: normalizedScopes,
        });
    }

    issueSessionForPairing(identity: {
        tokenId: string;
        scopes: AuthScope[];
    }): AuthSession | null {
        if (!this.isEnabled()) {
            return null;
        }

        const scopes = identity.scopes.filter((scope) => scope !== 'api:session');
        const normalizedScopes: AuthScope[] =
            scopes.length > 0 ? dedupeScopes(scopes) : ['api:read'];

        return this.createSessionRecord({
            tokenId: identity.tokenId,
            scopes: normalizedScopes,
        });
    }

    private createSessionRecord(identity: {
        tokenId: string;
        scopes: AuthScope[];
    }): AuthSession {
        const issuedAt = Date.now();
        const expiresAt = issuedAt + this.sessionTtlMs;
        const id = randomUUID();

        this.sessions.set(id, {
            id,
            tokenId: identity.tokenId,
            scopes: [...identity.scopes],
            createdAt: issuedAt,
            expiresAt,
        });

        return {
            id,
            tokenId: identity.tokenId,
            scopes: [...identity.scopes],
            createdAt: new Date(issuedAt).toISOString(),
            expiresAt: new Date(expiresAt).toISOString(),
        };
    }

    destroySession(request: Request): void {
        const session = this.resolveSession(request);
        if (!session) {
            return;
        }

        this.sessions.delete(session.id);
    }

    buildSessionCookie(session: AuthSession, request: Request): string {
        return serializeCookie(this.sessionCookieName, session.id, {
            maxAgeSeconds: Math.floor(this.sessionTtlMs / 1000),
            expiresAt: new Date(session.expiresAt),
            httpOnly: true,
            path: '/',
            sameSite: 'Lax',
            secure: new URL(request.url).protocol === 'https:',
        });
    }

    buildClearingCookie(request: Request): string {
        return serializeCookie(this.sessionCookieName, '', {
            maxAgeSeconds: 0,
            expiresAt: new Date(0),
            httpOnly: true,
            path: '/',
            sameSite: 'Lax',
            secure: new URL(request.url).protocol === 'https:',
        });
    }

    checkRateLimit(
        request: Request,
        bucket: string,
        identity?: AuthIdentity,
    ): RateLimitResult {
        if (!this.rateLimitEnabled) {
            return {
                allowed: true,
                limit: Number.POSITIVE_INFINITY,
                remaining: Number.POSITIVE_INFINITY,
                retryAfterSeconds: 0,
            };
        }

        this.pruneExpired();

        const now = Date.now();
        const subject = identity?.tokenId ?? getRequestIp(request);
        const key = `${bucket}:${subject}`;
        const current = this.rateLimits.get(key);

        if (!current || now - current.startedAt >= this.rateLimitWindowMs) {
            this.rateLimits.set(key, {
                startedAt: now,
                count: 1,
            });
            return {
                allowed: true,
                limit: this.rateLimitMaxRequests,
                remaining: Math.max(0, this.rateLimitMaxRequests - 1),
                retryAfterSeconds: Math.ceil(this.rateLimitWindowMs / 1000),
            };
        }

        current.count += 1;

        const remaining = Math.max(0, this.rateLimitMaxRequests - current.count);
        if (current.count > this.rateLimitMaxRequests) {
            return {
                allowed: false,
                limit: this.rateLimitMaxRequests,
                remaining: 0,
                retryAfterSeconds: Math.max(
                    1,
                    Math.ceil(
                        (current.startedAt + this.rateLimitWindowMs - now) / 1000,
                    ),
                ),
            };
        }

        return {
            allowed: true,
            limit: this.rateLimitMaxRequests,
            remaining,
            retryAfterSeconds: Math.max(
                1,
                Math.ceil((current.startedAt + this.rateLimitWindowMs - now) / 1000),
            ),
        };
    }

    private resolveIdentity(
        request: Request,
        options?: {
            allowSession?: boolean;
            bodyToken?: string | null | undefined;
        },
    ): AuthIdentity | null {
        this.pruneExpired();

        const bodyToken = options?.bodyToken?.trim();
        const bearerToken =
            bodyToken || parseBearerToken(request.headers.get('authorization'));
        if (bearerToken) {
            const match = this.findTokenByValue(bearerToken);
            if (match) {
                return defaultIdentity(match, 'bearer');
            }
        }

        if (!options?.allowSession) {
            return null;
        }

        const session = this.resolveSession(request);
        if (!session) {
            return null;
        }

        return {
            tokenId: session.tokenId,
            scopes: [...session.scopes],
            source: 'session',
            legacy: false,
        };
    }

    private resolveSession(request: Request): SessionRecord | null {
        const cookies = parseCookies(request.headers.get('cookie'));
        const sessionId = cookies.get(this.sessionCookieName)?.trim();
        if (!sessionId) {
            return null;
        }

        const session = this.sessions.get(sessionId);
        if (!session) {
            return null;
        }

        if (session.expiresAt <= Date.now()) {
            this.sessions.delete(session.id);
            return null;
        }

        return session;
    }

    private findTokenByValue(token: string): ResolvedAuthToken | null {
        for (const candidate of this.tokens) {
            if (constantTimeEquals(candidate.token, token)) {
                return candidate;
            }
        }

        return null;
    }

    private pruneExpired(): void {
        const now = Date.now();

        for (const [sessionId, session] of this.sessions.entries()) {
            if (session.expiresAt <= now) {
                this.sessions.delete(sessionId);
            }
        }

        for (const [bucket, state] of this.rateLimits.entries()) {
            if (now - state.startedAt >= this.rateLimitWindowMs) {
                this.rateLimits.delete(bucket);
            }
        }
    }
}
