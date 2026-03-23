import assert from 'node:assert/strict';
import test from 'node:test';

import { AuthManager } from './auth.js';
import type { WillClawConfig } from './config.js';

function createAuthConfig(): WillClawConfig {
    return {
        server: {
            auth_token: 'wc_test_token',
            auth: {
                tokens: [],
                managed_tokens_file: '/tmp/auth-tokens.json',
                session: {
                    cookie_name: 'willclaw_session',
                    ttl_hours: 24,
                },
                pairing: {
                    enabled: true,
                    store_file: '/tmp/pairing.json',
                    code_ttl_minutes: 15,
                    max_uses: 1,
                },
                rate_limit: {
                    enabled: false,
                    window_seconds: 60,
                    max_requests: 100,
                },
            },
        },
    } as WillClawConfig;
}

test('authorize tolerates malformed cookie headers without throwing', () => {
    const authManager = new AuthManager(createAuthConfig());
    const request = new Request('http://127.0.0.1/api/auth/status', {
        headers: {
            cookie: 'willclaw_session=%E0%A4%A',
        },
    });

    assert.doesNotThrow(() => {
        const result = authManager.authorize(request, ['api:read'], {
            allowSession: true,
        });
        assert.equal(result.ok, false);
        assert.equal(result.status, 401);
    });
});
