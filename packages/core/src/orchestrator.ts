import { randomUUID } from 'node:crypto';

import type { Logger } from 'pino';

import type { WillClawConfig } from './config.js';
import type { WillClawEventHub } from './events.js';
import {
    formatHostedActionRestriction,
    renderHostedActionBridgeInstructions,
    type HostedActionService,
    type HostedActionUse,
} from './hosted-actions.js';
import {
    renderMemorySearchBridgeInstructions,
    type MemorySearchService,
} from './memory-search.js';
import type { PromptAssembler, PromptSection } from './prompt.js';
import type { WillClawPaths } from './paths.js';
import {
    getHealthyProviderActions,
    getProviderHealth,
} from './provider-health.js';
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

function resolveExplicitAgent(
    text: string,
    configuredAgents: Iterable<string>,
    requestedAgent?: string,
): { explicitAgent?: string; text: string } {
    const stripped = stripExplicitAgent(text, configuredAgents);
    const explicitAgent = requestedAgent?.trim() || stripped.explicitAgent;

    return {
        ...(explicitAgent ? { explicitAgent } : {}),
        text: stripped.text || text.trim(),
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

function looksLikeHostedToolRequest(text: string): boolean {
    return /browser|screenshot|screen|ocr|desktop|窗口|界面|ui|网页|website|click|type into|press key|打开应用|activate app|open app/i.test(
        text,
    );
}

function looksLikeReadOnlyCodingRequest(text: string): boolean {
    return (
        looksLikeCodingRequest(text) &&
        !looksLikeMutatingRequest(text) &&
        /review|analy[sz]e|explain|understand|summarize|find|inspect|diff|trace|read|代码审查|分析|解释|排查|定位/i.test(
            text,
        )
    );
}

function stripNegatedMutatingPhrases(text: string): string {
    return text
        .replace(
            /\b(?:do not|don't|dont|no need to|without)\s+(?:write|edit|modify|change|update|create|delete|remove|install|implement|fix)\b/gi,
            ' ',
        )
        .replace(
            /(?:不要|别|无需|不用|不必)\s*(?:写|改|修改|更新|创建|删除|移除|安装|实现|修复)/g,
            ' ',
        );
}

function looksLikeMutatingRequest(text: string): boolean {
    return /write|edit|modify|change|update|create|delete|remove|install|implement|fix|写|改|修改|更新|创建|删除|安装|实现|修复/i.test(
        stripNegatedMutatingPhrases(text),
    );
}

type RoutePreferenceKey =
    | 'hosted_tools'
    | 'long_context'
    | 'read_only_coding'
    | 'coding'
    | 'simple_qa';
type RouteModeHint = 'hosted_tools' | 'long_context' | 'coding' | 'simple_qa';
type RouteReason = 'explicit' | 'mode_hint' | RoutePreferenceKey;

interface RouteSignals {
    looksLikeCoding: boolean;
    looksLikeHostedTools: boolean;
    looksLikeLongContext: boolean;
    looksLikeReadOnlyCoding: boolean;
    modeHint: RouteModeHint | null;
}

function normalizeModeHint(
    currentMode: string | undefined,
): RouteModeHint | null {
    const normalized = currentMode?.trim().toLowerCase();
    if (!normalized) {
        return null;
    }

    if (/browser|desktop|screen|research|ops|agentic/.test(normalized)) {
        return 'hosted_tools';
    }

    if (/long|context|analysis/.test(normalized)) {
        return 'long_context';
    }

    if (/coding|build|debug|implement|edit/.test(normalized)) {
        return 'coding';
    }

    if (/chat|qa|assistant/.test(normalized)) {
        return 'simple_qa';
    }

    return null;
}

function resolveRoutePreferenceKey(
    reason: RouteReason,
    modeHint?: RouteModeHint,
): RoutePreferenceKey | null {
    if (reason === 'explicit') {
        return null;
    }

    if (reason === 'mode_hint') {
        return modeHint ?? 'simple_qa';
    }

    return reason;
}

function determineRouteReason(signals: RouteSignals): RouteReason {
    if (signals.modeHint != null) {
        return 'mode_hint';
    }

    if (signals.looksLikeHostedTools) {
        return 'hosted_tools';
    }

    if (signals.looksLikeLongContext) {
        return 'long_context';
    }

    if (signals.looksLikeReadOnlyCoding) {
        return 'read_only_coding';
    }

    if (signals.looksLikeCoding) {
        return 'coding';
    }

    return 'simple_qa';
}

export interface RunChatRequest {
    text: string;
    agent?: string;
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
    reason: RouteReason;
    looksLikeCoding: boolean;
    looksLikeLongContext: boolean;
    looksLikeMutating: boolean;
    looksLikeHostedTools: boolean;
    modeHint?: RouteModeHint;
}

interface AgentRouteCandidate {
    configuredIndex: number;
    entry: WillClawConfig['agents']['pool'][string];
    name: string;
    toolPolicy: ResolvedAgentToolPolicy;
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
        private readonly hostedActionService: HostedActionService,
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

        const routePlan = this.inspectRoute(trimmedText, {
            ...(request.agent ? { agent: request.agent } : {}),
            ...(request.currentMode
                ? { currentMode: request.currentMode }
                : {}),
        });
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
            ...(request.channel ? { channel: request.channel } : {}),
            ...(request.chatId ? { chatId: request.chatId } : {}),
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
            looksLikeHostedTools: routePlan.looksLikeHostedTools,
            modeHint: routePlan.modeHint ?? null,
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
                const hostedBrowserEnabled = this.canUseHostedTool(
                    agentName,
                    'browser',
                );
                const hostedScreenEnabled = this.canUseHostedTool(
                    agentName,
                    'screen',
                );
                const hostedProviderHealth =
                    hostedBrowserEnabled || hostedScreenEnabled
                        ? await getProviderHealth(this.config)
                        : [];
                const hostedBrowserActions = hostedBrowserEnabled
                    ? getHealthyProviderActions(hostedProviderHealth, 'browser')
                    : [];
                const hostedScreenActions = hostedScreenEnabled
                    ? getHealthyProviderActions(hostedProviderHealth, 'screen')
                    : [];
                const hostedActionInstructions =
                    hostedBrowserActions.length > 0 ||
                    hostedScreenActions.length > 0
                        ? renderHostedActionBridgeInstructions({
                            browserActions: hostedBrowserActions,
                            screenActions: hostedScreenActions,
                        })
                        : null;
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
                    ...(hostedActionInstructions
                        ? {
                            systemPrompt: `${
                                memorySearchEnabled
                                    ? `${agentRequest.systemPrompt}\n\n## Hosted Memory Search\n${renderMemorySearchBridgeInstructions()}`
                                    : agentRequest.systemPrompt
                            }\n\n## Hosted Browser / Screen Actions\n${hostedActionInstructions}`,
                        }
                        : {}),
                    memorySearch: {
                        enabled: memorySearchEnabled,
                        maxCalls: 3,
                    },
                    hostedActionBridge: {
                        enabled: Boolean(hostedActionInstructions),
                        maxCalls: 4,
                        tools: [
                            ...(hostedBrowserActions.length > 0
                                ? (['browser'] as const)
                                : []),
                            ...(hostedScreenActions.length > 0
                                ? (['screen'] as const)
                                : []),
                        ],
                        allowedActions: {
                            ...(hostedBrowserActions.length > 0
                                ? { browser: hostedBrowserActions }
                                : {}),
                            ...(hostedScreenActions.length > 0
                                ? { screen: hostedScreenActions }
                                : {}),
                        },
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

    inspectRoute(
        text: string,
        options?: {
            agent?: string;
            currentMode?: string;
        },
    ): RoutePlan {
        const trimmedText = text.trim();
        const explicit = resolveExplicitAgent(
            trimmedText,
            this.agents.keys(),
            options?.agent,
        );
        const strippedText = explicit.text || trimmedText;
        const looksLikeLongContext = looksLikeLongContextRequest(strippedText);
        const looksLikeCoding = looksLikeCodingRequest(strippedText);
        const looksLikeMutating = looksLikeMutatingRequest(strippedText);
        const looksLikeHostedTools = looksLikeHostedToolRequest(strippedText);
        const looksLikeReadOnlyCoding = looksLikeReadOnlyCodingRequest(strippedText);
        const modeHint = normalizeModeHint(options?.currentMode);
        const signals: RouteSignals = {
            looksLikeCoding,
            looksLikeHostedTools,
            looksLikeLongContext,
            looksLikeReadOnlyCoding,
            modeHint,
        };
        const selectedAgent = explicit.explicitAgent
            ? explicit.explicitAgent
            : this.selectAgent(signals);
        const allowFallback =
            !explicit.explicitAgent &&
            (!looksLikeMutating ||
                this.config.agents.safety.mutating_fallback);
        const reason: RouteReason = explicit.explicitAgent
            ? 'explicit'
            : determineRouteReason(signals);

        return {
            text: trimmedText,
            strippedText,
            selectedAgent,
            ...(explicit.explicitAgent
                ? { explicitAgent: explicit.explicitAgent }
                : {}),
            fallbackChain: this.buildFallbackChain(
                selectedAgent,
                allowFallback,
                reason,
                modeHint ?? undefined,
            ),
            allowFallback,
            reason,
            looksLikeCoding,
            looksLikeLongContext,
            looksLikeMutating,
            looksLikeHostedTools,
            ...(modeHint ? { modeHint } : {}),
        };
    }

    private async executeAgent(
        agentName: string,
        backend: AgentBackend,
        request: AgentRequest,
    ) {
        const memorySearchEnabled = request.memorySearch?.enabled === true;
        const hostedActionEnabled = request.hostedActionBridge?.enabled === true;
        const allowedHostedActions = request.hostedActionBridge?.allowedActions ?? {};

        if (!memorySearchEnabled && !hostedActionEnabled) {
            return await backend.execute(request);
        }

        const memorySearchHistory = [...request.history];
        const usedQueries = new Set<string>();
        const memorySearches: Array<{
            query: string;
            messageCount: number;
            fileCount: number;
        }> = [];
        const hostedActions: HostedActionUse[] = [];
        const maxBridgeCalls =
            (memorySearchEnabled ? request.memorySearch?.maxCalls ?? 0 : 0) +
            (hostedActionEnabled ? request.hostedActionBridge?.maxCalls ?? 0 : 0);

        for (let callIndex = 0; callIndex <= maxBridgeCalls; callIndex += 1) {
            const response = await backend.execute({
                ...request,
                history: memorySearchHistory,
            });
            const memoryToolRequest = memorySearchEnabled
                ? this.memorySearchService.parseBridgeRequest(response.content)
                : null;
            const hostedActionRequest = hostedActionEnabled
                ? this.hostedActionService.parseBridgeRequest(response.content)
                : null;

            if (!memoryToolRequest && !hostedActionRequest) {
                if (memorySearches.length === 0 && hostedActions.length === 0) {
                    return response;
                }

                return {
                    ...response,
                    metadata: {
                        ...(response.metadata ?? {}),
                        ...(memorySearches.length > 0
                            ? { hostedMemorySearches: memorySearches }
                            : {}),
                        ...(hostedActions.length > 0
                            ? { hostedActions }
                            : {}),
                    },
                };
            }

            const bridgeKey = memoryToolRequest
                ? `memory:${JSON.stringify(memoryToolRequest)}`
                : `action:${JSON.stringify(hostedActionRequest)}`;
            if (
                callIndex === maxBridgeCalls ||
                usedQueries.has(bridgeKey)
            ) {
                return {
                    ...response,
                    content:
                        memoryToolRequest
                            ? 'WillClaw memory_search could not complete because the same lookup was requested repeatedly.'
                            : 'WillClaw hosted browser/screen bridge could not complete because the same action was requested repeatedly.',
                    metadata: {
                        ...(response.metadata ?? {}),
                        ...(memorySearches.length > 0
                            ? { hostedMemorySearches: memorySearches }
                            : {}),
                        ...(hostedActions.length > 0
                            ? { hostedActions }
                            : {}),
                        ...(memoryToolRequest
                            ? { memorySearchBridge: 'exhausted' }
                            : { hostedActionBridge: 'exhausted' }),
                    },
                };
            }

            usedQueries.add(bridgeKey);

            if (memoryToolRequest) {
                const searchResult = this.memorySearchService.search({
                    ...memoryToolRequest,
                    excludeRunId: request.runId,
                });

                memorySearches.push({
                    query: memoryToolRequest.query,
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
                            memoryToolRequest,
                            searchResult,
                        ),
                    },
                );
                this.logger.info(
                    {
                        runId: request.runId,
                        agent: agentName,
                        query: memoryToolRequest.query,
                        messageCount: searchResult.messages.length,
                        fileCount: searchResult.files.length,
                    },
                    'Served hosted memory_search to agent',
                );
                continue;
            }

            if (!hostedActionRequest) {
                continue;
            }

            const allowedActions = allowedHostedActions[hostedActionRequest.tool] ?? [];
            if (!allowedActions.includes(hostedActionRequest.action)) {
                hostedActions.push({
                    tool: hostedActionRequest.tool,
                    action: hostedActionRequest.action,
                    success: false,
                });
                memorySearchHistory.push(
                    {
                        role: 'assistant',
                        content: response.content.trim(),
                    },
                    {
                        role: 'system',
                        content: formatHostedActionRestriction({
                            request: hostedActionRequest,
                            allowedActions: allowedHostedActions,
                        }),
                    },
                );
                this.logger.warn(
                    {
                        runId: request.runId,
                        agent: agentName,
                        tool: hostedActionRequest.tool,
                        action: hostedActionRequest.action,
                        allowedActions,
                    },
                    'Hosted browser/screen action was blocked by action policy',
                );
                continue;
            }

            try {
                const hostedActionResult = await this.hostedActionService.execute(
                    hostedActionRequest,
                    {
                        runId: request.runId,
                        agent: agentName,
                        ...(request.channel ? { channel: request.channel } : {}),
                        ...(request.chatId ? { chatId: request.chatId } : {}),
                    },
                );
                hostedActions.push({
                    tool: hostedActionResult.tool,
                    action: hostedActionResult.action,
                    success: true,
                    ...(hostedActionResult.provider
                        ? { provider: hostedActionResult.provider }
                        : {}),
                });
                memorySearchHistory.push(
                    {
                        role: 'assistant',
                        content: response.content.trim(),
                    },
                    {
                        role: 'system',
                        content: this.hostedActionService.formatToolResult(
                            hostedActionRequest,
                            hostedActionResult,
                        ),
                    },
                );
                this.hostedActionService.logServedAction(
                    {
                        runId: request.runId,
                        agent: agentName,
                        ...(request.channel ? { channel: request.channel } : {}),
                        ...(request.chatId ? { chatId: request.chatId } : {}),
                    },
                    hostedActionResult,
                );
            } catch (error) {
                hostedActions.push({
                    tool: hostedActionRequest.tool,
                    action: hostedActionRequest.action,
                    success: false,
                });
                memorySearchHistory.push(
                    {
                        role: 'assistant',
                        content: response.content.trim(),
                    },
                    {
                        role: 'system',
                        content: this.hostedActionService.formatToolError(
                            hostedActionRequest,
                            error,
                        ),
                    },
                );
                this.logger.warn(
                    {
                        runId: request.runId,
                        agent: agentName,
                        tool: hostedActionRequest.tool,
                        action: hostedActionRequest.action,
                        error:
                            error instanceof Error
                                ? error.message
                                : 'Unknown hosted action error',
                    },
                    'Hosted browser/screen action failed for agent',
                );
            }
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

    private selectAgent(signals: RouteSignals): string {
        const reason = determineRouteReason(signals);
        const routeKey = resolveRoutePreferenceKey(
            reason,
            signals.modeHint ?? undefined,
        );
        const ranked = routeKey
            ? this.rankAgentsForRoute(routeKey)
            : [];

        return (
            ranked[0] ??
            this.pickFirstConfigured([
                this.config.agents.default,
                this.config.agents.routing.simple_qa ?? this.config.agents.default,
            ])
        );
    }

    private buildFallbackChain(
        preferredAgent: string,
        allowFallback: boolean,
        reason: RouteReason,
        modeHint?: RouteModeHint,
    ): string[] {
        if (!allowFallback) {
            return [preferredAgent];
        }

        const routeKey = resolveRoutePreferenceKey(reason, modeHint);
        const ranked = routeKey
            ? this.rankAgentsForRoute(routeKey)
            : this.listEnabledRouteCandidates().map((candidate) => candidate.name);

        return [...new Set([preferredAgent, ...ranked])];
    }

    private getFallbackOrderForRoute(
        routeKey: RoutePreferenceKey,
    ): string[] {
        switch (routeKey) {
            case 'hosted_tools':
                return ['direct-api', 'gemini', 'claude-code', 'codex', 'opencode'];
            case 'long_context':
                return ['gemini', 'direct-api', 'claude-code', 'codex', 'opencode'];
            case 'read_only_coding':
                return ['codex', 'claude-code', 'gemini', 'opencode', 'direct-api'];
            case 'coding':
                return ['claude-code', 'codex', 'opencode', 'gemini', 'direct-api'];
            case 'simple_qa':
            default:
                return ['direct-api', 'gemini', 'claude-code', 'codex', 'opencode'];
        }
    }

    private rankAgentsForRoute(routeKey: RoutePreferenceKey): string[] {
        const fallbackOrder = this.getFallbackOrderForRoute(routeKey);
        const ranked = this.listEnabledRouteCandidates()
            .map((candidate) => ({
                candidate,
                score: this.scoreRouteCandidate(candidate, routeKey),
            }))
            .sort((left, right) => {
                if (right.score !== left.score) {
                    return right.score - left.score;
                }

                const leftFallbackIndex = fallbackOrder.indexOf(left.candidate.name);
                const rightFallbackIndex = fallbackOrder.indexOf(right.candidate.name);
                if (leftFallbackIndex !== rightFallbackIndex) {
                    if (leftFallbackIndex === -1) {
                        return 1;
                    }

                    if (rightFallbackIndex === -1) {
                        return -1;
                    }

                    return leftFallbackIndex - rightFallbackIndex;
                }

                return left.candidate.configuredIndex - right.candidate.configuredIndex;
            });

        return ranked.map(({ candidate }) => candidate.name);
    }

    private scoreRouteCandidate(
        candidate: AgentRouteCandidate,
        routeKey: RoutePreferenceKey,
    ): number {
        const { entry, name, toolPolicy } = candidate;
        const nativeCoding =
            toolPolicy.shell === 'native' &&
            toolPolicy.filesystem === 'native';
        const hostedBrowser = toolPolicy.browser === 'hosted';
        const hostedScreen = toolPolicy.screen === 'hosted';
        const hostedMemorySearch = toolPolicy.memory_search === 'hosted';
        const hostedInteractive = hostedBrowser || hostedScreen;
        const configuredRouteAgent = this.getConfiguredRouteAgent(routeKey);
        const fallbackOrder = this.getFallbackOrderForRoute(routeKey);
        const fallbackIndex = fallbackOrder.indexOf(name);
        let score = 0;

        if (configuredRouteAgent === name) {
            score += 400;
        }

        if (name === this.config.agents.default) {
            score += 5;
        }

        if (fallbackIndex >= 0) {
            score += Math.max(0, 40 - fallbackIndex * 6);
        }

        if (entry.type === 'cli') {
            score += 6;
        }

        if (entry.type === 'api') {
            score += 4;
        }

        score += Math.max(0, 10 - candidate.configuredIndex);

        switch (routeKey) {
            case 'hosted_tools':
                if (hostedInteractive) {
                    score += 90;
                }
                if (hostedBrowser) {
                    score += 20;
                }
                if (hostedScreen) {
                    score += 20;
                }
                if (hostedMemorySearch) {
                    score += 10;
                }
                if (entry.type === 'api') {
                    score += 25;
                }
                if (nativeCoding && !hostedInteractive) {
                    score -= 25;
                }
                break;
            case 'long_context':
                if (entry.type === 'api') {
                    score += 15;
                }
                if (hostedMemorySearch) {
                    score += 12;
                }
                if (name === 'gemini') {
                    score += 25;
                }
                if (hostedInteractive) {
                    score += 5;
                }
                break;
            case 'read_only_coding':
                if (nativeCoding) {
                    score += 85;
                }
                if (entry.type === 'cli') {
                    score += 20;
                }
                if (hostedMemorySearch) {
                    score += 10;
                }
                if (entry.type === 'api') {
                    score -= 30;
                }
                if (hostedInteractive) {
                    score -= 5;
                }
                break;
            case 'coding':
                if (nativeCoding) {
                    score += 100;
                }
                if (entry.type === 'cli') {
                    score += 20;
                }
                if (hostedMemorySearch) {
                    score += 4;
                }
                if (entry.type === 'api') {
                    score -= 40;
                }
                break;
            case 'simple_qa':
                if (entry.type === 'api') {
                    score += 40;
                }
                if (hostedMemorySearch) {
                    score += 15;
                }
                if (hostedInteractive) {
                    score += 10;
                }
                if (nativeCoding) {
                    score -= 10;
                }
                break;
        }

        return score;
    }

    private getConfiguredRouteAgent(
        routeKey: RoutePreferenceKey,
    ): string | undefined {
        const configured = this.config.agents.routing[routeKey];
        if (!configured) {
            return undefined;
        }

        return this.config.agents.pool[configured]?.enabled ? configured : undefined;
    }

    private listEnabledRouteCandidates(): AgentRouteCandidate[] {
        return Object.entries(this.config.agents.pool)
            .filter(([, entry]) => entry.enabled)
            .map(([name, entry], configuredIndex) => ({
                configuredIndex,
                entry,
                name,
                toolPolicy: resolveAgentToolPolicy(this.config, name),
            }));
    }

    private pickFirstConfigured(candidates: string[]): string {
        for (const candidate of candidates) {
            if (this.config.agents.pool[candidate]?.enabled) {
                return candidate;
            }
        }

        return this.config.agents.default;
    }
}
