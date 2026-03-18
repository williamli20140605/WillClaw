import type { AgentToolMode, HostToolName, WillClawConfig } from './config.js';
import { HOST_TOOL_NAMES } from './config.js';
import { resolveAgentToolPolicy } from './tool-policy.js';

export type HostToolCategory =
    | 'terminal'
    | 'filesystem'
    | 'browser'
    | 'screen'
    | 'memory';

export interface HostToolCatalogEntry {
    name: HostToolName;
    category: HostToolCategory;
    label: string;
    description: string;
    globalEnabled: boolean;
    providers?: string[];
    preferredProvider?: string;
    fallbackProvider?: string;
    mode?: AgentToolMode;
    hostedEnabled?: boolean;
}

interface HostToolMetadata {
    category: HostToolCategory;
    label: string;
    description: string;
}

const HOST_TOOL_METADATA: Record<HostToolName, HostToolMetadata> = {
    shell: {
        category: 'terminal',
        label: 'Terminal',
        description: 'Run shell commands on the WillClaw host machine.',
    },
    filesystem: {
        category: 'filesystem',
        label: 'Filesystem',
        description: 'Read and write files from the WillClaw host workspace.',
    },
    browser: {
        category: 'browser',
        label: 'Browser',
        description:
            'Run hosted browser actions such as open, snapshot, click, type, and screenshot.',
    },
    screen: {
        category: 'screen',
        label: 'Screen',
        description:
            'Inspect the host desktop and run capture, see, click, type, and key actions.',
    },
    memory_search: {
        category: 'memory',
        label: 'Memory Search',
        description: 'Search WillClaw messages, MEMORY.md, and daily notes.',
    },
};

function isToolGloballyEnabled(
    config: WillClawConfig,
    toolName: HostToolName,
): boolean {
    if (toolName === 'browser') {
        return config.tools.browser.providers.length > 0;
    }

    if (toolName === 'screen') {
        return (
            config.tools.screen.enabled && config.tools.screen.providers.length > 0
        );
    }

    return true;
}

function getConfiguredProviders(
    config: WillClawConfig,
    toolName: HostToolName,
): string[] {
    if (toolName === 'browser') {
        return [...config.tools.browser.providers];
    }

    if (toolName === 'screen') {
        return [...config.tools.screen.providers];
    }

    return [];
}

export function listHostTools(
    config: WillClawConfig,
    agentName?: string,
): HostToolCatalogEntry[] {
    const agentPolicy = agentName
        ? resolveAgentToolPolicy(config, agentName)
        : undefined;

    return HOST_TOOL_NAMES.map((toolName) => {
        const metadata = HOST_TOOL_METADATA[toolName];
        const globalEnabled = isToolGloballyEnabled(config, toolName);
        const entry: HostToolCatalogEntry = {
            name: toolName,
            category: metadata.category,
            label: metadata.label,
            description: metadata.description,
            globalEnabled,
        };
        const providers = getConfiguredProviders(config, toolName);

        if (providers.length > 0) {
            entry.providers = providers;
            const preferredProvider = providers[0];
            const fallbackProvider = providers[1];

            if (preferredProvider) {
                entry.preferredProvider = preferredProvider;
            }

            if (fallbackProvider) {
                entry.fallbackProvider = fallbackProvider;
            }
        }

        if (agentPolicy) {
            entry.mode = agentPolicy[toolName];
            entry.hostedEnabled = agentPolicy[toolName] === 'hosted' && globalEnabled;
        }

        return entry;
    });
}
