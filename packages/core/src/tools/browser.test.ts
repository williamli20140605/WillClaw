import assert from 'node:assert/strict';
import test from 'node:test';

import type { WillClawConfig } from '../config.js';

import { getConfiguredBrowserProviders } from './browser.js';

function createConfig(
    providers: WillClawConfig['tools']['browser']['providers'],
): WillClawConfig {
    return {
        tools: {
            browser: {
                providers,
                headless: true,
            },
        },
    } as WillClawConfig;
}

test('getConfiguredBrowserProviders keeps configured order for generic browser actions', () => {
    const providers = getConfiguredBrowserProviders(
        createConfig(['system-open', 'agent-browser']),
    );

    assert.deepEqual(providers, ['system-open', 'agent-browser']);
});

test('getConfiguredBrowserProviders restricts structured actions to agent-browser', () => {
    const providers = getConfiguredBrowserProviders(
        createConfig(['system-open', 'agent-browser']),
        'structured',
    );

    assert.deepEqual(providers, ['agent-browser']);
});

test('getConfiguredBrowserProviders returns no structured providers when agent-browser is not configured', () => {
    const providers = getConfiguredBrowserProviders(
        createConfig(['system-open']),
        'structured',
    );

    assert.deepEqual(providers, []);
});
