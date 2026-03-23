import assert from 'node:assert/strict';
import test from 'node:test';

import type { Logger } from 'pino';

import type { AgentBackend } from './agents/types.js';
import type { WillClawConfig } from './config.js';
import { WillClawEventHub } from './events.js';
import { Orchestrator } from './orchestrator.js';

function createBackend(
    name: string,
    type: AgentBackend['type'],
    available: boolean,
): AgentBackend {
    return {
        name,
        type,
        async cancel() { },
        async execute() {
            return {
                agent: name,
                content: 'ok',
                duration: 1,
            };
        },
        async isAvailable() {
            return available;
        },
    };
}

function createOrchestrator(input: {
    agentAvailability: Record<string, boolean>;
    pool: WillClawConfig['agents']['pool'];
    routing?: Record<string, string>;
}) {
    const agents = new Map<string, AgentBackend>();
    for (const [name, entry] of Object.entries(input.pool)) {
        agents.set(
            name,
            createBackend(
                name,
                entry.type,
                input.agentAvailability[name] ?? false,
            ),
        );
    }

    return new Orchestrator(
        {
            agents: {
                default: 'claude-code',
                routing: input.routing ?? {},
                safety: {
                    prompt_transport: 'stdin',
                    mutating_fallback: false,
                },
                pool: input.pool,
            },
            tools: {
                screen: {
                    enabled: true,
                },
            },
        } as WillClawConfig,
        {
            homeDir: '/tmp',
        } as never,
        {} as never,
        agents,
        {} as never,
        {} as never,
        ({
            error() { },
            info() { },
            warn() { },
        } as unknown) as Logger,
        new WillClawEventHub(),
    );
}

test('inspectRouteWithAvailability avoids unavailable hosted-tool defaults', async () => {
    const orchestrator = createOrchestrator({
        agentAvailability: {
            'claude-code': true,
            codex: true,
            'direct-api': false,
        },
        routing: {
            hosted_tools: 'direct-api',
        },
        pool: {
            'claude-code': {
                enabled: true,
                type: 'cli',
                command: 'claude',
                args: [],
                output_format: 'text',
                timeout: 300,
                completion_notify: false,
                tool_policy: {
                    shell: 'native',
                    filesystem: 'native',
                    browser: 'disabled',
                    screen: 'disabled',
                    memory_search: 'hosted',
                },
            },
            codex: {
                enabled: true,
                type: 'cli',
                command: 'codex',
                args: [],
                output_format: 'text',
                timeout: 300,
                completion_notify: false,
                tool_policy: {
                    shell: 'native',
                    filesystem: 'native',
                    browser: 'disabled',
                    screen: 'disabled',
                    memory_search: 'hosted',
                },
            },
            'direct-api': {
                enabled: true,
                type: 'api',
                provider: 'anthropic',
                model: 'test-model',
                api_key_env: 'ANTHROPIC_API_KEY',
                endpoint: 'https://example.com',
                max_tokens: 1024,
                completion_notify: false,
                tool_policy: {
                    shell: 'hosted',
                    filesystem: 'hosted',
                    browser: 'hosted',
                    screen: 'hosted',
                    memory_search: 'hosted',
                },
            },
        },
    });

    const plan = await orchestrator.inspectRouteWithAvailability(
        'open a website and take a screenshot',
    );

    assert.equal(plan.selectedAgent, 'claude-code');
    assert.equal(plan.fallbackChain.includes('direct-api'), false);
});

test('inspectRouteWithAvailability prefers available hosted-tool agents when they exist', async () => {
    const orchestrator = createOrchestrator({
        agentAvailability: {
            'claude-code': true,
            'direct-api': false,
            'hosted-api': true,
        },
        pool: {
            'claude-code': {
                enabled: true,
                type: 'cli',
                command: 'claude',
                args: [],
                output_format: 'text',
                timeout: 300,
                completion_notify: false,
                tool_policy: {
                    shell: 'native',
                    filesystem: 'native',
                    browser: 'disabled',
                    screen: 'disabled',
                    memory_search: 'hosted',
                },
            },
            'direct-api': {
                enabled: true,
                type: 'api',
                provider: 'anthropic',
                model: 'test-model',
                api_key_env: 'ANTHROPIC_API_KEY',
                endpoint: 'https://example.com',
                max_tokens: 1024,
                completion_notify: false,
                tool_policy: {
                    shell: 'hosted',
                    filesystem: 'hosted',
                    browser: 'hosted',
                    screen: 'hosted',
                    memory_search: 'hosted',
                },
            },
            'hosted-api': {
                enabled: true,
                type: 'api',
                provider: 'anthropic',
                model: 'test-model',
                api_key_env: 'ANTHROPIC_API_KEY',
                endpoint: 'https://example.com',
                max_tokens: 1024,
                completion_notify: false,
                tool_policy: {
                    shell: 'hosted',
                    filesystem: 'hosted',
                    browser: 'hosted',
                    screen: 'hosted',
                    memory_search: 'hosted',
                },
            },
        },
    });

    const plan = await orchestrator.inspectRouteWithAvailability(
        'open a website and take a screenshot',
    );

    assert.equal(plan.selectedAgent, 'hosted-api');
    assert.equal(plan.fallbackChain[0], 'hosted-api');
});
