import {
    HOST_TOOL_NAMES,
    type AgentPoolEntry,
    type AgentToolMode,
    type AgentToolPolicy,
    type HostToolName,
    type WillClawConfig,
} from './config.js';

export type ResolvedAgentToolPolicy = Record<HostToolName, AgentToolMode>;

const CLI_DEFAULT_TOOL_POLICY: ResolvedAgentToolPolicy = {
    shell: 'native',
    filesystem: 'native',
    browser: 'disabled',
    screen: 'disabled',
};

const API_DEFAULT_TOOL_POLICY: ResolvedAgentToolPolicy = {
    shell: 'hosted',
    filesystem: 'hosted',
    browser: 'disabled',
    screen: 'disabled',
};

const ACP_DEFAULT_TOOL_POLICY: ResolvedAgentToolPolicy = {
    shell: 'disabled',
    filesystem: 'disabled',
    browser: 'disabled',
    screen: 'disabled',
};

function getBasePolicy(entry: AgentPoolEntry): ResolvedAgentToolPolicy {
    if (entry.type === 'cli') {
        return { ...CLI_DEFAULT_TOOL_POLICY };
    }

    if (entry.type === 'api') {
        return { ...API_DEFAULT_TOOL_POLICY };
    }

    return { ...ACP_DEFAULT_TOOL_POLICY };
}

function applyConfigGuards(
    config: WillClawConfig,
    policy: ResolvedAgentToolPolicy,
): ResolvedAgentToolPolicy {
    const guarded = { ...policy };

    if (!config.tools.screen.enabled) {
        guarded.screen = 'disabled';
    }

    return guarded;
}

export function resolveAgentToolPolicy(
    config: WillClawConfig,
    agentName: string,
): ResolvedAgentToolPolicy {
    const entry = config.agents.pool[agentName];
    if (!entry) {
        return {
            shell: 'disabled',
            filesystem: 'disabled',
            browser: 'disabled',
            screen: 'disabled',
        };
    }

    const base = getBasePolicy(entry);
    const overrides: AgentToolPolicy = entry.tool_policy ?? {};

    for (const toolName of HOST_TOOL_NAMES) {
        const override = overrides[toolName];
        if (override) {
            base[toolName] = override;
        }
    }

    return applyConfigGuards(config, base);
}

export function getAgentToolMode(
    config: WillClawConfig,
    agentName: string,
    toolName: HostToolName,
): AgentToolMode {
    return resolveAgentToolPolicy(config, agentName)[toolName];
}
