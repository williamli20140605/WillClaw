import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { Logger } from 'pino';

import type { WillClawConfig } from './config.js';
import { PairingManager } from './pairing.js';

function createLogger(): Logger {
    return ({
        info() { },
        warn() { },
        error() { },
        debug() { },
    } as unknown) as Logger;
}

async function createPairingManager(enabled: boolean) {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'willclaw-pairing-'));
    const manager = new PairingManager(
        {
            server: {
                auth: {
                    pairing: {
                        enabled,
                        store_file: path.join(directory, 'pairing.json'),
                        code_ttl_minutes: 15,
                        max_uses: 1,
                    },
                },
            },
        } as WillClawConfig,
        createLogger(),
    );

    await manager.initialize();

    return {
        manager,
        async cleanup() {
            await rm(directory, { recursive: true, force: true });
        },
    };
}

test('createInvite rejects when pairing is disabled', async (t) => {
    const { manager, cleanup } = await createPairingManager(false);
    t.after(cleanup);

    await assert.rejects(
        () =>
            manager.createInvite({
                kind: 'web',
                createdBy: 'owner',
            }),
        /Pairing is disabled\./,
    );
});

test('pairChannelUser returns null when pairing is disabled', async (t) => {
    const { manager, cleanup } = await createPairingManager(false);
    t.after(cleanup);

    const result = await manager.pairChannelUser({
        channel: 'telegram',
        userId: 'user-1',
        code: 'wc_pair_test',
    });

    assert.equal(result, null);
});
