import { randomUUID } from 'node:crypto';

import type { Logger } from 'pino';

import type { WillClawConfig } from './config.js';
import type { WillClawEventHub } from './events.js';
import {
    renderMemorySearchBridgeInstructions,
    type MemorySearchService,
} from './memory-search.js';
import type { PromptAssembler, PromptSection } from './prompt.js';
import type { WillClawPaths } from './paths.js';
import {
    getAgentToolMode,
    resolveAgentToolPolicy,
    type ResolvedAgentToolPolicy,
} from './tool-policy.js';

import { AgentExecutionError } from './agents/errors.js';
import type {
    AgentAvailability,
    AgentBackend,
    AgentRequest,
    AgentTextStreamUpdate,
    ChatMessage,
    ExecutionMode,
} from './agents/types.js';

const FALLBACK_ORDER = [
    'claude-code',
    'codex',
    'opencode',
    'gemini',
    'direct-api',
];

function stripExplicitAgent(
    text: string,
    configuredAgents: Iterable<string>,
): { explicitAgent?: string; text: string } {
    const match = text.trim().match(/^@([a-z0-9_-]+)\b/i);
    if (!match) {
        return { text };
    }

    const candidate = match[1];
    if (!candidate) {
        return { text };
    }

    const configured = new Set(configuredAgents);
    if (!configured.has(candidate)) {
        return { text };
    }

    return {
        explicitAgent: candidate,
        text: text
            .trim()
            .replace(/^@[a-z0-9_-]+\b\s*/i, '')
            .trim(),
    };
}

function looksLikeLongContextRequest(text: string): boolean {
    return (
        text.length > 4_000 ||
        /长上下文|long context|长文|论文|paper|100页|50页|1m context/i.test(text)
    );
}

function looksLikeCodingRequest(text: string): boolean {
    return /code|function|bug|refactor|typescript|javascript|python|测试|修复|重构|代码|函数|报错|实现/i.test(
        text,
    );
}

function looksLikeMutatingRequest(text: string): boolean {
    return /write|edit|modify|change|update|create|delete|remove|install|implement|fix|写|改|修改|更新|创建|删除|安装|实现|修复/i.test(
        text,
    );
}

export interface RunChatRequest {
    text: string;
    history?: ChatMessage[];
    isGroup?: boolean;
    workingDirectory?: string;
    executionMode?: ExecutionMode;
    currentMode?: string;
    channel?: string;
    chatId?: string;
    runId?: string;
    onTextStream?: (
        update: AgentTextStreamUpdate & {
            agent: string;
        },
    ) => void;
}

export interface RunChatResult {
    runId: string;
    agent: string;
    content: string;
    duration: number;
    attemptedAgents: string[];
    systemPromptChars: number;
    promptSections: PromptSection[];
    exitCode?: number;
    rawOutput?: string;
    metadata?: Record<string, unknown>;
}

export interface RoutePlan {
    text: string;
    strippedText: string;
    selectedAgent: string;
    explicitAgent?: string;
    fallbackChain: string[];
    allowFallback: boolean;
    reason: 'explicit' | 'long_context' | 'coding' | 'simple_qa';
    looksLikeCoding: boolean;
    looksLikeLongContext: boolean;
    looksLikeMutating: boolean;
}

export class Orchestrator {
    private readonly activeRuns = new Map<
        string,
        {
            agent: string;
            backend: AgentBackend;
            startedAt: number;
        }
    >();

    constructor(
        private readonly config: WillClawConfig,
        private readonly paths: WillClawPaths,
        private readonly promptAssembler: PromptAssembler,
        private readonly agents: Map<string, AgentBackend>,
        private readonly memorySearchService: MemorySearchService,
        private readonly logger: Logger,
        private readonly eventHub: WillClawEventHub,
    ) { }

    async listAgents(): Promise<AgentAvailability[]> {
        const availability = await Promise.all(
            Object.entries(this.config.agents.pool).map(async ([name, entry]) => {
                const backend = this.agents.get(name);
                const available = entry.enabled
                    ? await (backend?.isAvailable() ?? Promise.resolve(false))
                    : false;

                return {
                    name,
                    type: entry.type,
                    enabled: entry.enabled,
                    available,
                    toolPolicies: resolveAgentToolPolicy(this.config, name),
                };
            }),
        );

        return availability;
    }

    async runChat(request: RunChatRequest): Promise<RunChatResult> {
        const trimmedText = request.text.trim();
        if (!trimmedText) {
            throw new Error('Chat text cannot be empty.');
        }

        const routePlan = this.inspectRoute(trimmedText);
        const attemptedAgents: string[] = [];
        const attemptedErrors: string[] = [];
        const promptOptions: NonNullable<
            Parameters<PromptAssembler['assembleSystemPrompt']>[0]
        > = {
            trigger: 'chat',
        };

        if (request.isGroup !== undefined) {
            promptOptions.isGroup = request.isGroup;
        }

        if (request.currentMode) {
            promptOptions.currentMode = request.currentMode;
        }

        const { systemPrompt, sections, totalChars } =
            await this.promptAssembler.assembleSystemPrompt(promptOptions);
        const agentRequest: AgentRequest = {
            runId: request.runId ?? randomUUID(),
            text: routePlan.strippedText,
            systemPrompt,
            history: request.history ?? [],
            executionMode: request.executionMode ?? 'foreground',
        };

        if (request.workingDirectory) {
            agentRequest.workingDirectory = request.workingDirectory;
        }

        this.eventHub.publish('chat.route.selected', {
            runId: agentRequest.runId,
            channel: request.channel ?? null,
            chatId: request.chatId ?? null,
            selectedAgent: routePlan.selectedAgent,
            explicitAgent: routePlan.explicitAgent ?? null,
            allowFallback: routePlan.allowFallback,
            fallbackChain: routePlan.fallbackChain,
            reason: routePlan.reason,
            looksLikeCoding: routePlan.looksLikeCoding,
            looksLikeLongContext: routePlan.looksLikeLongContext,
            looksLikeMutating: routePlan.looksLikeMutating,
            executionMode: agentRequest.executionMode ?? 'foreground',
        });

        for (const [attemptIndex, agentName] of routePlan.fallbackChain.entries()) {
            const backend = this.agents.get(agentName);
            attemptedAgents.push(agentName);

            if (!backend) {
                attemptedErrors.push(`${agentName}: backend not configured`);
                this.eventHub.publish('chat.agent.skipped', {
                    runId: agentRequest.runId,
                    channel: request.channel ?? null,
                    chatId: request.chatId ?? null,
                    agent: agentName,
                    reason: 'backend_not_configured',
                    attemptIndex,
                    attemptCount: routePlan.fallbackChain.length,
                });
                if (routePlan.explicitAgent) {
                    break;
                }
                continue;
            }

            if (!(await backend.isAvailable())) {
                attemptedErrors.push(`${agentName}: unavailable`);
                this.eventHub.publish('chat.agent.skipped', {
                    runId: agentRequest.runId,
                    channel: request.channel ?? null,
                    chatId: request.chatId ?? null,
                    agent: agentName,
                    reason: 'unavailable',
                    attemptIndex,
                    attemptCount: routePlan.fallbackChain.length,
                });
                if (routePlan.explicitAgent) {
                    break;
                }
                continue;
            }

            this.logger.info(
                {
                    runId: agentRequest.runId,
                    selectedAgent: agentName,
                    requestedAgent: routePlan.explicitAgent,
                    workingDirectory: request.workingDirectory ?? this.paths.homeDir,
                },
                'Dispatching chat request to agent',
            );

            try {
                const memorySearchEnabled = this.canUseHostedTool(
                    agentName,
                    'memory_search',
                );
                this.activeRuns.set(agentRequest.runId, {
                    agent: agentName,
                    backend,
                    startedAt: Date.now(),
                });
                this.eventHub.publish('chat.agent.started', {
                    runId: agentRequest.runId,
                    channel: request.channel ?? null,
                    chatId: request.chatId ?? null,
                    agent: agentName,
                    attemptIndex,
                    attemptCount: routePlan.fallbackChain.length,
                    allowFallback: routePlan.allowFallback,
                });
                const response = await this.executeAgent(agentName, backend, {
                    ...agentRequest,
                    ...(request.onTextStream
                        ? {
                            onTextStream: (update: AgentTextStreamUpdate) => {
                                request.onTextStream?.({
                                    agent: agentName,
                                    ...update,
                                });
                            },
                        }
                        : {}),
                    systemPrompt: memorySearchEnabled
                        ? `${agentRequest.systemPrompt}\n\n## Hosted Memory Search\n${renderMemorySearchBridgeInstructions()}`
                        : agentRequest.systemPrompt,
                    memorySearch: {
                        enabled: memorySearchEnabled,
                        maxCalls: 3,
                    },
                });
                const result: RunChatResult = {
                    runId: agentRequest.runId,
                    agent: response.agent,
                    content: response.content,
                    duration: response.duration,
                    attemptedAgents,
                    systemPromptChars: totalChars,
                    promptSections: sections,
                };

                if (response.exitCode != null) {
                    result.exitCode = response.exitCode;
                }

                if (response.rawOutput) {
                    result.rawOutput = response.rawOutput;
                }

                if (response.metadata) {
                    result.metadata = response.metadata;
                }

                result.metadata = {
                    ...(result.metadata ?? {}),
                    route: {
                        selectedAgent: routePlan.selectedAgent,
                        explicitAgent: routePlan.explicitAgent ?? null,
                        allowFallback: routePlan.allowFallback,
                        fallbackChain: routePlan.fallbackChain,
                        reason: routePlan.reason,
                    },
                };

                return result;
            } catch (error) {
                const detail =
                    error instanceof AgentExecutionError
                        ? error.message
                        : error instanceof Error
                            ? error.message
                            : 'Unknown agent failure';
                attemptedErrors.push(`${agentName}: ${detail}`);
                this.logger.warn(
                    {
                        runId: agentRequest.runId,
                        agent: agentName,
                        error: detail,
                    },
                    'Agent execution failed',
                );
                this.eventHub.publish('chat.agent.failed', {
                    runId: agentRequest.runId,
                    channel: request.channel ?? null,
                    chatId: request.chatId ?? null,
                    agent: agentName,
                    error: detail,
                    attemptIndex,
                    attemptCount: routePlan.fallbackChain.length,
                });

                if (!routePlan.allowFallback || routePlan.explicitAgent) {
                    throw error;
                }
            } finally {
                this.activeRuns.delete(agentRequest.runId);
            }
        }

        throw new Error(
            `All agent attempts failed: ${attemptedErrors.join('; ') || 'no available agents'}`,
        );
    }

    inspectRoute(text: string): RoutePlan {
        const trimmedText = text.trim();
        const explicit = stripExplicitAgent(trimmedText, this.agents.keys());
        const strippedText = explicit.text || trimmedText;
        const looksLikeLongContext = looksLikeLongContextRequest(strippedText);
        const looksLikeCoding = looksLikeCodingRequest(strippedText);
        const looksLikeMutating = looksLikeMutatingRequest(strippedText);
        const selectedAgent = explicit.explicitAgent
            ? explicit.explicitAgent
            : this.selectAgent(strippedText);
        const allowFallback =
            !explicit.explicitAgent &&
            (!looksLikeMutating ||
                this.config.agents.safety.mutating_fallback);
        const reason = explicit.explicitAgent
            ? 'explicit'
            : looksLikeLongContext
                ? 'long_context'
                : looksLikeCoding
                    ? 'coding'
                    : 'simple_qa';

        return {
            text: trimmedText,
            strippedText,
            selectedAgent,
            ...(explicit.explicitAgent
                ? { explicitAgent: explicit.explicitAgent }
                : {}),
            fallbackChain: this.buildFallbackChain(selectedAgent, allowFallback),
            allowFallback,
            reason,
            looksLikeCoding,
            looksLikeLongContext,
            looksLikeMutating,
        };
    }

    private async executeAgent(
        agentName: string,
        backend: AgentBackend,
        request: AgentRequest,
    ) {
        if (!request.memorySearch?.enabled) {
            return await backend.execute(request);
        }

        const memorySearchHistory = [...request.history];
        const usedQueries = new Set<string>();
        const memorySearches: Array<{
            query: string;
            messageCount: number;
            fileCount: number;
        }> = [];

        for (let callIndex = 0; callIndex <= request.memorySearch.maxCalls; callIndex += 1) {
            const response = await backend.execute({
                ...request,
                history: memorySearchHistory,
            });
            const toolRequest = this.memorySearchService.parseBridgeRequest(
                response.content,
            );
            if (!toolRequest) {
                if (memorySearches.length === 0) {
                    return response;
                }

                return {
                    ...response,
                    metadata: {
                        ...(response.metadata ?? {}),
                        hostedMemorySearches: memorySearches,
                    },
                };
            }

            const searchKey = JSON.stringify(toolRequest);
            if (
                callIndex === request.memorySearch.maxCalls ||
                usedQueries.has(searchKey)
            ) {
                return {
                    ...response,
                    content:
                        'WillClaw memory_search could not complete because the same lookup was requested repeatedly.',
                    metadata: {
                        ...(response.metadata ?? {}),
                        hostedMemorySearches: memorySearches,
                        memorySearchBridge: 'exhausted',
                    },
                };
            }

            usedQueries.add(searchKey);
            const searchResult = this.memorySearchService.search({
                ...toolRequest,
                excludeRunId: request.runId,
            });

            memorySearches.push({
                query: toolRequest.query,
                messageCount: searchResult.messages.length,
                fileCount: searchResult.files.length,
            });
            memorySearchHistory.push(
                {
                    role: 'assistant',
                    content: response.content.trim(),
                },
                {
                    role: 'system',
                    content: this.memorySearchService.formatToolResult(
                        toolRequest,
                        searchResult,
                    ),
                },
            );
            this.logger.info(
                {
                    runId: request.runId,
                    agent: agentName,
                    query: toolRequest.query,
                    messageCount: searchResult.messages.length,
                    fileCount: searchResult.files.length,
                },
                'Served hosted memory_search to agent',
            );
        }

        return await backend.execute(request);
    }

    getAgentToolPolicy(agentName: string): ResolvedAgentToolPolicy {
        return resolveAgentToolPolicy(this.config, agentName);
    }

    canUseHostedTool(agentName: string, toolName: keyof ResolvedAgentToolPolicy): boolean {
        return getAgentToolMode(this.config, agentName, toolName) === 'hosted';
    }

    async cancelRun(runId: string): Promise<boolean> {
        const activeRun = this.activeRuns.get(runId);
        if (!activeRun) {
            return false;
        }

        await activeRun.backend.cancel(runId);
        return true;
    }

    isRunActive(runId: string): boolean {
        return this.activeRuns.has(runId);
    }

    getActiveRun(runId: string):
        | {
            agent: string;
            startedAt: number;
        }
        | undefined {
        const activeRun = this.activeRuns.get(runId);
        if (!activeRun) {
            return undefined;
        }

        return {
            agent: activeRun.agent,
            startedAt: activeRun.startedAt,
        };
    }

    private selectAgent(text: string): string {
        if (looksLikeLongContextRequest(text)) {
            return (
                this.config.agents.routing.long_context ?? this.config.agents.default
            );
        }

        if (looksLikeCodingRequest(text)) {
            return this.config.agents.routing.coding ?? this.config.agents.default;
        }

        return this.config.agents.routing.simple_qa ?? this.config.agents.default;
    }

    private buildFallbackChain(
        preferredAgent: string,
        allowFallback: boolean,
    ): string[] {
        if (!allowFallback) {
            return [preferredAgent];
        }

        const configuredAgents = Object.entries(this.config.agents.pool)
            .filter(([, entry]) => entry.enabled)
            .map(([name]) => name);
        const ordered = [preferredAgent, ...FALLBACK_ORDER, ...configuredAgents];

        return [...new Set(ordered)].filter((name) =>
            configuredAgents.includes(name),
        );
    }
}
