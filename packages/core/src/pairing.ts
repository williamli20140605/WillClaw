import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { Logger } from 'pino';

import type { AuthScope, WillClawConfig } from './config.js';

const CHANNEL_PAIRING_TARGETS = ['telegram', 'discord', 'feishu'] as const;

export type PairingChannel = (typeof CHANNEL_PAIRING_TARGETS)[number];
export type PairingInviteKind = 'web' | 'channel';

interface StoredPairingInvite {
    id: string;
    kind: PairingInviteKind;
    codeHash: string;
    codePreview: string;
    createdAt: string;
    expiresAt: string;
    maxUses: number;
    usedCount: number;
    scopes: AuthScope[];
    channels: PairingChannel[];
    createdBy: string;
    redeemedAt?: string;
}

interface StoredPairingGrant {
    id: string;
    channel: PairingChannel;
    userId: string;
    inviteId: string;
    createdAt: string;
}

interface PairingState {
    invites: StoredPairingInvite[];
    grants: StoredPairingGrant[];
}

export interface PairingInviteView {
    id: string;
    kind: PairingInviteKind;
    codePreview: string;
    createdAt: string;
    expiresAt: string;
    maxUses: number;
    usedCount: number;
    scopes: AuthScope[];
    channels: PairingChannel[];
    createdBy: string;
    redeemedAt?: string;
    active: boolean;
}

export interface PairingGrantView {
    id: string;
    channel: PairingChannel;
    userId: string;
    inviteId: string;
    createdAt: string;
}

export interface CreatedPairingInvite {
    id: string;
    code: string;
    kind: PairingInviteKind;
    createdAt: string;
    expiresAt: string;
    maxUses: number;
    scopes: AuthScope[];
    channels: PairingChannel[];
}

export interface PairingRedeemResult {
    inviteId: string;
    tokenId: string;
    scopes: AuthScope[];
}

function defaultPairingState(): PairingState {
    return {
        invites: [],
        grants: [],
    };
}

function hashCode(code: string): string {
    return createHash('sha256').update(code).digest('hex');
}

function constantTimeEquals(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    if (leftBuffer.length !== rightBuffer.length) {
        return false;
    }

    return timingSafeEqual(leftBuffer, rightBuffer);
}

function nowIso(): string {
    return new Date().toISOString();
}

function isInviteActive(invite: StoredPairingInvite, now = Date.now()): boolean {
    return (
        invite.usedCount < invite.maxUses &&
        new Date(invite.expiresAt).getTime() > now
    );
}

function renderInviteView(invite: StoredPairingInvite): PairingInviteView {
    return {
        id: invite.id,
        kind: invite.kind,
        codePreview: invite.codePreview,
        createdAt: invite.createdAt,
        expiresAt: invite.expiresAt,
        maxUses: invite.maxUses,
        usedCount: invite.usedCount,
        scopes: [...invite.scopes],
        channels: [...invite.channels],
        createdBy: invite.createdBy,
        ...(invite.redeemedAt ? { redeemedAt: invite.redeemedAt } : {}),
        active: isInviteActive(invite),
    };
}

function isPairingChannel(value: string): value is PairingChannel {
    return CHANNEL_PAIRING_TARGETS.includes(value as PairingChannel);
}

export class PairingManager {
    private state: PairingState = defaultPairingState();
    private loaded = false;

    constructor(
        private readonly config: WillClawConfig,
        private readonly logger: Logger,
    ) {}

    async initialize(): Promise<void> {
        await this.ensureLoaded();
    }

    isEnabled(): boolean {
        return this.config.server.auth.pairing.enabled;
    }

    async createInvite(options: {
        kind: PairingInviteKind;
        createdBy: string;
        ttlMinutes?: number;
        maxUses?: number;
        scopes?: AuthScope[];
        channels?: PairingChannel[];
    }): Promise<CreatedPairingInvite> {
        await this.ensureLoaded();

        const code = `wc_pair_${randomBytes(9).toString('base64url')}`;
        const createdAt = nowIso();
        const ttlMinutes =
            options.ttlMinutes ?? this.config.server.auth.pairing.code_ttl_minutes;
        const maxUses =
            options.maxUses ?? this.config.server.auth.pairing.max_uses;
        const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();
        const scopes =
            options.kind === 'web'
                ? [...(options.scopes ?? ['api:read', 'api:write', 'api:events'])]
                : [];
        const channels =
            options.kind === 'channel'
                ? [...new Set((options.channels ?? []).filter(isPairingChannel))]
                : [];
        if (options.kind === 'channel' && channels.length === 0) {
            throw new Error('Channel pairing invites must include at least one channel.');
        }

        const invite: StoredPairingInvite = {
            id: randomBytes(8).toString('hex'),
            kind: options.kind,
            codeHash: hashCode(code),
            codePreview: code.slice(-6),
            createdAt,
            expiresAt,
            maxUses,
            usedCount: 0,
            scopes,
            channels,
            createdBy: options.createdBy,
        };

        this.state.invites.unshift(invite);
        await this.persist();

        return {
            id: invite.id,
            code,
            kind: invite.kind,
            createdAt: invite.createdAt,
            expiresAt: invite.expiresAt,
            maxUses: invite.maxUses,
            scopes: [...invite.scopes],
            channels: [...invite.channels],
        };
    }

    async redeemWebInvite(code: string): Promise<PairingRedeemResult | null> {
        await this.ensureLoaded();

        const invite = this.findMatchingInvite(code, 'web');
        if (!invite) {
            return null;
        }

        invite.usedCount += 1;
        invite.redeemedAt = nowIso();
        await this.persist();

        return {
            inviteId: invite.id,
            tokenId: `pair:${invite.id}`,
            scopes: [...invite.scopes],
        };
    }

    async pairChannelUser(options: {
        channel: string;
        userId: string;
        code: string;
    }): Promise<PairingGrantView | null> {
        await this.ensureLoaded();

        if (!isPairingChannel(options.channel)) {
            return null;
        }

        const invite = this.findMatchingInvite(options.code, 'channel');
        if (!invite || !invite.channels.includes(options.channel)) {
            return null;
        }

        const existing = this.state.grants.find(
            (grant) =>
                grant.channel === options.channel && grant.userId === options.userId,
        );
        if (existing) {
            invite.usedCount += 1;
            invite.redeemedAt = nowIso();
            await this.persist();
            return existing;
        }

        invite.usedCount += 1;
        invite.redeemedAt = nowIso();

        const grant: StoredPairingGrant = {
            id: randomBytes(8).toString('hex'),
            channel: options.channel,
            userId: options.userId,
            inviteId: invite.id,
            createdAt: nowIso(),
        };
        this.state.grants.unshift(grant);
        await this.persist();
        return grant;
    }

    async listInvites(): Promise<PairingInviteView[]> {
        await this.ensureLoaded();
        return this.state.invites.map(renderInviteView);
    }

    async listGrants(): Promise<PairingGrantView[]> {
        await this.ensureLoaded();
        return this.state.grants.map((grant) => ({ ...grant }));
    }

    hasChannelGrant(channel: string, userId: string): boolean {
        if (!isPairingChannel(channel)) {
            return false;
        }

        return this.state.grants.some(
            (grant) => grant.channel === channel && grant.userId === userId,
        );
    }

    private findMatchingInvite(
        code: string,
        kind: PairingInviteKind,
    ): StoredPairingInvite | null {
        const normalizedCode = code.trim();
        if (!normalizedCode) {
            return null;
        }

        const hashed = hashCode(normalizedCode);
        const now = Date.now();
        return (
            this.state.invites.find((invite) => {
                return (
                    invite.kind === kind &&
                    isInviteActive(invite, now) &&
                    constantTimeEquals(invite.codeHash, hashed)
                );
            }) ?? null
        );
    }

    private async ensureLoaded(): Promise<void> {
        if (this.loaded) {
            return;
        }

        this.loaded = true;
        await mkdir(path.dirname(this.config.server.auth.pairing.store_file), {
            recursive: true,
        });

        try {
            const raw = await readFile(
                this.config.server.auth.pairing.store_file,
                'utf8',
            );
            const parsed = JSON.parse(raw) as Partial<PairingState>;
            this.state = {
                invites: Array.isArray(parsed.invites) ? parsed.invites : [],
                grants: Array.isArray(parsed.grants) ? parsed.grants : [],
            };
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                this.logger.warn(
                    {
                        error:
                            error instanceof Error ? error.message : String(error),
                        filepath: this.config.server.auth.pairing.store_file,
                    },
                    'WillClaw pairing store could not be loaded; starting empty',
                );
            }
            this.state = defaultPairingState();
        }
    }

    private async persist(): Promise<void> {
        await writeFile(
            this.config.server.auth.pairing.store_file,
            JSON.stringify(this.state, null, 2),
            'utf8',
        );
    }
}
