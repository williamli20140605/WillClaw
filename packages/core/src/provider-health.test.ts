import assert from 'node:assert/strict';
import test from 'node:test';

import { getHealthyProviderActions, type ProviderHealthEntry } from './provider-health.js';

test('getHealthyProviderActions ignores healthy actions from unconfigured providers', () => {
    const health: ProviderHealthEntry[] = [
        {
            tool: 'browser',
            provider: 'system-open',
            configured: true,
            available: true,
            healthy: true,
            detail: 'configured open',
            actions: [
                {
                    action: 'open',
                    available: true,
                    healthy: true,
                    detail: 'open available',
                },
            ],
        },
        {
            tool: 'browser',
            provider: 'agent-browser',
            configured: false,
            available: true,
            healthy: true,
            detail: 'installed but disabled',
            actions: [
                {
                    action: 'snapshot',
                    available: true,
                    healthy: true,
                    detail: 'snapshot available',
                },
            ],
        },
    ];

    assert.deepEqual(getHealthyProviderActions(health, 'browser'), ['open']);
});
