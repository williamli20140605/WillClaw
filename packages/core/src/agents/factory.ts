import {
    isAcpAgentPoolEntry,
    isApiAgentPoolEntry,
    isCliAgentPoolEntry,
    type AgentPoolEntry,
    type WillClawConfig,
} from '../config.js';

import { AcpAgentBackend } from './acp-agent.js';
import { CliAgentBackend } from './cli-agent.js';
import { DirectApiAgentBackend } from './direct-api.js';
import type { AgentBackend } from './types.js';

function createBackend(
    name: string,
    entry: AgentPoolEntry,
    promptTransport: 'stdin' | 'argv',
): AgentBackend {
    if (isCliAgentPoolEntry(entry)) {
        return new CliAgentBackend(name, entry, promptTransport);
    }

    if (isApiAgentPoolEntry(entry)) {
        return new DirectApiAgentBackend(name, entry);
    }

    if (isAcpAgentPoolEntry(entry)) {
        return new AcpAgentBackend(name, entry);
    }

    throw new Error(`Unsupported agent type for ${name}`);
}

export function createAgentBackends(
    config: WillClawConfig,
): Map<string, AgentBackend> {
    const promptTransport = config.agents.safety.prompt_transport;
    const backends = new Map<string, AgentBackend>();

    for (const [name, entry] of Object.entries(config.agents.pool)) {
        if (!entry.enabled) {
            continue;
        }

        backends.set(name, createBackend(name, entry, promptTransport));
    }

    return backends;
}
