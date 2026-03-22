import { randomUUID } from 'node:crypto';

import type { Logger } from 'pino';

import type { WillClawConfig } from './config.js';
import type { CommandCompletionMonitor } from './completion-monitor.js';
import type { WillClawEventHub } from './events.js';
import type { HistoryExporter } from './history-exporter.js';
import type {
    InvalidSearchCommand,
    MemorySearchService,
    ParsedSearchCommand,
} from './memory-search.js';
import type { MemoryStore, StoredCommandRun, StoredMessage } from './memory.js';
import type {
    Orchestrator,
    RunChatRequest,
    RunChatResult,
} from './orchestrator.js';

export class RunCancelledError extends Error {
    constructor(runId: string) {
        super(`Run ${runId} was cancelled.`);
        this.name = 'RunCancelledError';
    }
}

interface RunState {
    runId: string;
    channel: string;
    chatId: string;
    userId: string;
    userMessageId: number;
    cancelRequested: boolean;
}

type ActiveRunState = RunState;

interface QueuedRunState extends RunState {
    queueKey: string;
    position: number;
}

interface PreparedChatExecution {
    request: ChatServiceRequest;
    builtinCommand: ParsedSearchCommand | InvalidSearchCommand | null;
    channel: string;
    chatId: string;
    userId: string;
    runId: string;
    userMessageId: number;
    queueKey: string;
    queuePosition: number;
}

export interface ChatServiceRequest extends RunChatRequest {
    channel?: string;
    chatId?: string;
    userId?: string;
    editOf?: number;
}

export interface ChatServiceResult extends RunChatResult {
    channel: string;
    chatId: string;
    userMessageId: number;
    assistantMessageId: number;
    completionMessageId?: number;
}

export interface RunStatusResult {
    run: StoredCommandRun | null;
    active: boolean;
}

export interface QueuedRunInfo {
    runId: string;
    channel: string;
    chatId: string;
    userId: string;
    userMessageId: number;
    status: 'queued' | 'running';
    position: number;
    ahead: number;
}

export interface ChatQueueSummary {
    channel: string;
    chatId: string;
    total: number;
    queued: number;
    running: number;
    runs: QueuedRunInfo[];
}

export interface CancelRunResult extends RunStatusResult {
    cancelled: boolean;
    noteMessageId?: number;
}

export interface RevokeMessagesResult {
    targetMessageId: number;
    runId?: string;
    revokedMessageIds: number[];
    noteMessageId?: number;
}

interface RevokeMessageOptions {
    annotate?: boolean;
}

export interface EditMessageRequest extends Omit<ChatServiceRequest, 'text'> {
    text: string;
}

export interface EditMessageResult {
    revokedMessageIds: number[];
    noteMessageId?: number;
    result: ChatServiceResult;
}

export class ChatService {
    private readonly activeRuns = new Map<string, ActiveRunState>();
    private readonly queuedRuns = new Map<string, QueuedRunState>();
    private readonly chatQueueOrder = new Map<string, string[]>();
    private readonly chatQueueTails = new Map<string, Promise<void>>();

    constructor(
        private readonly config: WillClawConfig,
        private readonly orchestrator: Orchestrator,
        private readonly memoryStore: MemoryStore,
        private readonly memorySearchService: MemorySearchService,
        private readonly historyExporter: HistoryExporter | null,
        private readonly completionMonitor: CommandCompletionMonitor,
        private readonly logger: Logger,
        private readonly eventHub: WillClawEventHub,
    ) { }

    async handleChat(request: ChatServiceRequest): Promise<ChatServiceResult> {
        const channel = request.channel ?? 'web';
        const chatId = request.chatId ?? 'default';
        const userId = request.userId ?? 'local-user';
        const runId = request.runId ?? randomUUID();
        const builtinCommand = this.memorySearchService.parseCommand(request.text);
        const userMessageInput: Parameters<MemoryStore['saveMessage']>[0] = {
            timestamp: new Date().toISOString(),
            channel,
            chatId,
            userId,
            role: 'user',
            content: request.text,
            runId,
        };
        if (request.editOf != null) {
            userMessageInput.editOf = request.editOf;
        }

        const userMessage = this.memoryStore.saveMessage(userMessageInput);

        await this.exportMessage(userMessage);
        this.publishMessageEvent('message.created', userMessage);
        const queueKey = this.getQueueKey(channel, chatId);
        const queuePosition = this.enqueueQueuedRun(queueKey, runId);
        const queued = queuePosition > 1;
        this.memoryStore.saveCommandRun({
            runId,
            agent: builtinCommand ? 'willclaw-command' : 'orchestrator',
            chatId,
            prompt: request.text,
            status: queued ? 'queued' : 'running',
        });
        if (queued) {
            this.queuedRuns.set(runId, {
                runId,
                channel,
                chatId,
                userId,
                userMessageId: userMessage.id,
                cancelRequested: false,
                queueKey,
                position: queuePosition,
            });
            this.eventHub.publish('chat.run.queued', {
                runId,
                channel,
                chatId,
                userId,
                userMessageId: userMessage.id,
                executionMode: request.executionMode ?? 'foreground',
                text: request.text,
                builtinCommand: Boolean(builtinCommand),
                position: queuePosition,
                ahead: queuePosition - 1,
            });
        }

        const prepared: PreparedChatExecution = {
            request,
            builtinCommand,
            channel,
            chatId,
            userId,
            runId,
            userMessageId: userMessage.id,
            queueKey,
            queuePosition,
        };
        const previousTail = this.chatQueueTails.get(queueKey) ?? Promise.resolve();
        const executionPromise = previousTail
            .catch(() => undefined)
            .then(async () => await this.executePreparedChat(prepared));
        const tailPromise = executionPromise
            .then(() => undefined, () => undefined)
            .finally(() => {
                this.removeQueuedRun(queueKey, runId);
                if (this.chatQueueTails.get(queueKey) === tailPromise) {
                    this.chatQueueTails.delete(queueKey);
                }
            });
        this.chatQueueTails.set(queueKey, tailPromise);

        return await executionPromise;
    }

    private async executePreparedChat(
        prepared: PreparedChatExecution,
    ): Promise<ChatServiceResult> {
        const {
            request,
            builtinCommand,
            channel,
            chatId,
            userId,
            runId,
            userMessageId,
            queueKey,
            queuePosition,
        } = prepared;
        const history =
            request.history ??
            this.buildQueuedChatHistory({
                channel,
                chatId,
                queueKey,
                runId,
                currentUserMessageId: userMessageId,
            });
        const queuedState = this.queuedRuns.get(runId);
        if (queuedState?.cancelRequested) {
            this.queuedRuns.delete(runId);
            throw new RunCancelledError(runId);
        }

        if (queuedState) {
            this.memoryStore.updateCommandRun(runId, {
                status: 'running',
            });
            this.queuedRuns.delete(runId);
        }

        this.activeRuns.set(runId, {
            runId,
            channel,
            chatId,
            userId,
            userMessageId,
            cancelRequested: false,
        });
        this.eventHub.publish('chat.run.started', {
            runId,
            channel,
            chatId,
            userId,
            userMessageId,
            executionMode: request.executionMode ?? 'foreground',
            text: request.text,
            builtinCommand: Boolean(builtinCommand),
            queuePosition,
            queued: queuePosition > 1,
        });

        try {
            if (builtinCommand) {
                return await this.handleBuiltInCommand(
                    builtinCommand,
                    request,
                    userMessageId,
                    runId,
                    channel,
                    chatId,
                );
            }

            const result = await this.orchestrator.runChat({
                ...request,
                ...(history ? { history } : {}),
                runId,
                onTextStream: (update) => {
                    if (!update.content) {
                        return;
                    }

                    this.eventHub.publish('chat.run.stream.delta', {
                        runId,
                        channel,
                        chatId,
                        agent: update.agent,
                        content: update.content,
                        delta: update.delta,
                        mode: update.mode,
                        parser: update.parser,
                        eventTypes: update.eventTypes ?? [],
                        executionMode: request.executionMode ?? 'foreground',
                    });
                },
            });
            if (this.isRunCancelled(runId)) {
                throw new RunCancelledError(runId);
            }

            const assistantMessageInput = {
                timestamp: new Date().toISOString(),
                channel,
                chatId,
                userId: result.agent,
                role: 'assistant',
                content: result.content,
                agent: result.agent,
                durationMs: result.duration,
                metadata: {
                    attemptedAgents: result.attemptedAgents,
                    promptSections: result.promptSections,
                    ...(result.metadata ?? {}),
                },
                runId: result.runId,
            } satisfies Omit<Parameters<MemoryStore['saveMessage']>[0], 'exitCode'>;

            if (result.exitCode != null) {
                (
                    assistantMessageInput as Parameters<MemoryStore['saveMessage']>[0]
                ).exitCode = result.exitCode;
            }

            const assistantMessage = this.memoryStore.saveMessage(
                assistantMessageInput as Parameters<MemoryStore['saveMessage']>[0],
            );

            await this.exportMessage(assistantMessage);
            this.publishMessageEvent('message.created', assistantMessage);
            const completedRunUpdate: Partial<Parameters<MemoryStore['saveCommandRun']>[0]> = {
                agent: result.agent,
                status: 'completed',
                durationMs: result.duration,
            };
            if (result.exitCode != null) {
                completedRunUpdate.exitCode = result.exitCode;
            }
            if (result.rawOutput) {
                completedRunUpdate.stdout = result.rawOutput;
            }

            this.memoryStore.updateCommandRun(result.runId, completedRunUpdate);

            const completionInput: Parameters<
                CommandCompletionMonitor['buildCompletionMessage']
            >[0] = {
                agent: result.agent,
                executionMode: request.executionMode ?? 'foreground',
                durationMs: result.duration,
                output: result.content,
            };

            if (result.exitCode != null) {
                completionInput.exitCode = result.exitCode;
            }

            const completionMessage =
                this.completionMonitor.buildCompletionMessage(completionInput);
            let completionMessageId: number | undefined;

            if (completionMessage) {
                const storedCompletion = await this.createSystemMessage({
                    channel,
                    chatId,
                    content: completionMessage.content,
                    metadata: completionMessage.metadata,
                    runId: result.runId,
                });
                completionMessageId = storedCompletion.id;
            }

            const response: ChatServiceResult = {
                ...result,
                channel,
                chatId,
                userMessageId,
                assistantMessageId: assistantMessage.id,
            };

            if (completionMessageId != null) {
                response.completionMessageId = completionMessageId;
            }

            this.eventHub.publish('chat.run.completed', {
                runId: result.runId,
                channel,
                chatId,
                agent: result.agent,
                attemptedAgents: result.attemptedAgents,
                route: result.metadata?.route ?? null,
                durationMs: result.duration,
                assistantMessageId: assistantMessage.id,
                completionMessageId,
                executionMode: request.executionMode ?? 'foreground',
            });

            return response;
        } catch (error) {
            const cancelled =
                this.isRunCancelled(runId) || error instanceof RunCancelledError;
            const failureMessage =
                error instanceof Error ? error.message : 'Unknown failure';
            const currentRun = this.memoryStore.getCommandRun(runId);

            this.memoryStore.updateCommandRun(runId, {
                status: cancelled ? 'cancelled' : 'failed',
                stderr:
                    cancelled && currentRun?.stderr
                        ? currentRun.stderr
                        : failureMessage,
            });
            this.logger[cancelled ? 'warn' : 'error'](
                {
                    runId,
                    channel,
                    chatId,
                    error: failureMessage,
                },
                cancelled ? 'Chat execution cancelled' : 'Chat execution failed',
            );

            this.eventHub.publish(
                cancelled ? 'chat.run.cancelled' : 'chat.run.failed',
                {
                    runId,
                    channel,
                    chatId,
                    error: failureMessage,
                },
            );

            if (cancelled) {
                throw new RunCancelledError(runId);
            }

            throw error;
        } finally {
            this.activeRuns.delete(runId);
        }
    }

    private async handleBuiltInCommand(
        builtinCommand: ParsedSearchCommand | InvalidSearchCommand,
        request: ChatServiceRequest,
        userMessageId: number,
        runId: string,
        channel: string,
        chatId: string,
    ): Promise<ChatServiceResult> {
        const startedAt = Date.now();

        if ('error' in builtinCommand) {
            return await this.completeBuiltInCommand({
                runId,
                channel,
                chatId,
                userMessageId,
                content: `${builtinCommand.error}\nUsage: ${builtinCommand.usage}`,
                duration: Date.now() - startedAt,
                metadata: {
                    subtype: 'builtin_command_error',
                    command: 'search',
                },
            });
        }

        const searchResult = this.memorySearchService.search({
            ...builtinCommand.request,
            excludeRunId: runId,
        });

        return await this.completeBuiltInCommand({
            runId,
            channel,
            chatId,
            userMessageId,
            content: this.memorySearchService.formatCommandResult(
                builtinCommand.request,
                searchResult,
            ),
            duration: Date.now() - startedAt,
            metadata: {
                subtype: 'builtin_command',
                command: 'search',
                query: builtinCommand.request.query,
                messageCount: searchResult.messages.length,
                fileCount: searchResult.files.length,
                executionMode: request.executionMode ?? 'foreground',
            },
        });
    }

    getRunStatus(runId: string): RunStatusResult {
        return {
            run: this.memoryStore.getCommandRun(runId),
            active:
                this.activeRuns.has(runId) ||
                this.queuedRuns.has(runId) ||
                this.orchestrator.isRunActive(runId),
        };
    }

    listQueues(options?: {
        channel?: string;
        chatId?: string;
    }): ChatQueueSummary[] {
        const summaries = new Map<string, ChatQueueSummary>();

        for (const [queueKey, runIds] of this.chatQueueOrder.entries()) {
            for (const [index, runId] of runIds.entries()) {
                const runningState = this.activeRuns.get(runId);
                const queuedState = this.queuedRuns.get(runId);
                const state = runningState ?? queuedState;
                if (!state) {
                    continue;
                }

                if (options?.channel && state.channel !== options.channel) {
                    continue;
                }

                if (options?.chatId && state.chatId !== options.chatId) {
                    continue;
                }

                const summary =
                    summaries.get(queueKey) ??
                    {
                        channel: state.channel,
                        chatId: state.chatId,
                        total: 0,
                        queued: 0,
                        running: 0,
                        runs: [],
                    };

                const status = runningState ? 'running' : 'queued';
                const runInfo: QueuedRunInfo = {
                    runId,
                    channel: state.channel,
                    chatId: state.chatId,
                    userId: state.userId,
                    userMessageId: state.userMessageId,
                    status,
                    position: index + 1,
                    ahead: index,
                };

                summary.total += 1;
                summary[status] += 1;
                summary.runs.push(runInfo);
                summaries.set(queueKey, summary);
            }
        }

        return [...summaries.values()];
    }

    async cancelRun(
        runId: string,
        options?: {
            annotate?: boolean;
        },
    ): Promise<CancelRunResult> {
        const state = this.activeRuns.get(runId);
        const queuedState = this.queuedRuns.get(runId);
        if (state) {
            state.cancelRequested = true;
        }
        if (queuedState) {
            queuedState.cancelRequested = true;
            this.removeQueuedRun(queuedState.queueKey, runId);
        }

        const cancelled = await this.orchestrator.cancelRun(runId);
        const run = this.memoryStore.getCommandRun(runId);

        if (!run && !state && !queuedState) {
            return {
                run: null,
                active: false,
                cancelled: false,
            };
        }

        const canCancel =
            Boolean(state) ||
            Boolean(queuedState) ||
            run?.status === 'queued' ||
            run?.status === 'running' ||
            this.orchestrator.isRunActive(runId);
        if (!canCancel) {
            return {
                run,
                active: false,
                cancelled: false,
            };
        }

        const updatedRun =
            run &&
            (this.memoryStore.updateCommandRun(runId, {
                status: 'cancelled',
                stderr: queuedState
                    ? 'Cancelled while queued by user request'
                    : 'Cancelled by user request',
            }) ??
                run);
        const noteMessage =
            options?.annotate === false
                ? null
                : await this.createRunLifecycleNote(
                    state ?? queuedState,
                    updatedRun ?? run,
                    queuedState
                        ? `Cancelled queued run \`${runId}\`.`
                        : `Cancelled run \`${runId}\`.`,
                    {
                        subtype: 'run_cancelled',
                        runId,
                        ...(queuedState ? { queued: true } : {}),
                    },
                );
        this.eventHub.publish('chat.run.cancelled', {
            runId,
            channel: state?.channel ?? queuedState?.channel ?? null,
            chatId: state?.chatId ?? queuedState?.chatId ?? null,
            error: queuedState
                ? 'Cancelled while queued by user request'
                : 'Cancelled by user request',
            ...(queuedState ? { queued: true } : {}),
        });

        const response: CancelRunResult = {
            run: updatedRun ?? run,
            active: false,
            cancelled: cancelled || Boolean(state) || Boolean(queuedState),
        };
        if (noteMessage) {
            response.noteMessageId = noteMessage.id;
        }

        return response;
    }

    async revokeMessage(
        messageId: number,
        options?: RevokeMessageOptions,
    ): Promise<RevokeMessagesResult | null> {
        const message = this.memoryStore.getMessageById(messageId);
        if (!message) {
            return null;
        }

        if (message.runId) {
            await this.cancelRun(message.runId, { annotate: false });
        }

        const linkedMessages = message.runId
            ? this.memoryStore.listMessagesByRunId(message.runId, {
                includeRevoked: true,
            })
            : [message];
        const toRevoke = linkedMessages
            .filter((entry) => entry.status !== 'revoked')
            .map((entry) => entry.id);
        const revokedMessages = this.memoryStore.revokeMessages(toRevoke);
        this.eventHub.publish('message.revoked', {
            targetMessageId: message.id,
            runId: message.runId ?? null,
            revokedMessageIds: revokedMessages.map((entry) => entry.id),
            channel: message.channel,
            chatId: message.chatId,
        });
        const noteMessage =
            options?.annotate === false
                ? null
                : await this.createSystemMessage({
                    channel: message.channel,
                    chatId: message.chatId,
                    content: `Revoked ${revokedMessages.length} message(s) linked to message #${message.id}.`,
                    metadata: {
                        subtype: 'message_revoked',
                        targetMessageId: message.id,
                        runId: message.runId ?? null,
                        revokedMessageIds: revokedMessages.map((entry) => entry.id),
                    },
                });

        const response: RevokeMessagesResult = {
            targetMessageId: message.id,
            revokedMessageIds: revokedMessages.map((entry) => entry.id),
        };
        if (noteMessage) {
            response.noteMessageId = noteMessage.id;
        }
        if (message.runId) {
            response.runId = message.runId;
        }

        return response;
    }

    async editMessage(
        messageId: number,
        request: EditMessageRequest,
    ): Promise<EditMessageResult | null> {
        const original = this.memoryStore.getMessageById(messageId);
        if (!original) {
            return null;
        }

        if (original.role !== 'user') {
            throw new Error('Only user messages can be edited.');
        }

        const history = this.buildEditedChatHistory({
            channel: original.channel,
            chatId: original.chatId,
            ...(original.runId ? { excludedRunId: original.runId } : {}),
        });
        const result = await this.handleChat({
            ...request,
            channel: original.channel,
            chatId: original.chatId,
            userId: original.userId,
            history,
            text: request.text,
            editOf: original.id,
        });
        const revoked = await this.revokeMessage(messageId, {
            annotate: false,
        });
        const noteMessage = await this.createSystemMessage({
            channel: original.channel,
            chatId: original.chatId,
            content: `Edited message #${original.id} and resent it as message #${result.userMessageId}.`,
            metadata: {
                subtype: 'message_edited',
                originalMessageId: original.id,
                newMessageId: result.userMessageId,
            },
        });

        return {
            revokedMessageIds: revoked?.revokedMessageIds ?? [],
            noteMessageId: noteMessage.id,
            result,
        };
    }

    async resendMessage(
        messageId: number,
        request?: Omit<ChatServiceRequest, 'text'>,
    ): Promise<ChatServiceResult | null> {
        const original = this.memoryStore.getMessageById(messageId);
        if (!original) {
            return null;
        }

        if (original.role !== 'user') {
            throw new Error('Only user messages can be resent.');
        }

        return await this.handleChat({
            ...request,
            channel: request?.channel ?? original.channel,
            chatId: request?.chatId ?? original.chatId,
            userId: request?.userId ?? original.userId,
            text: original.content,
        });
    }

    private isRunCancelled(runId: string): boolean {
        return (
            this.activeRuns.get(runId)?.cancelRequested ??
            this.queuedRuns.get(runId)?.cancelRequested ??
            false
        );
    }

    private getQueueKey(channel: string, chatId: string): string {
        return `${channel}::${chatId}`;
    }

    private enqueueQueuedRun(queueKey: string, runId: string): number {
        const queue = this.chatQueueOrder.get(queueKey) ?? [];
        queue.push(runId);
        this.chatQueueOrder.set(queueKey, queue);
        return queue.length;
    }

    private removeQueuedRun(queueKey: string, runId: string): void {
        const queue = this.chatQueueOrder.get(queueKey);
        if (!queue) {
            return;
        }

        const nextQueue = queue.filter((entry) => entry !== runId);
        if (nextQueue.length === 0) {
            this.chatQueueOrder.delete(queueKey);
            return;
        }

        this.chatQueueOrder.set(queueKey, nextQueue);
    }

    private buildQueuedChatHistory(input: {
        channel: string;
        chatId: string;
        queueKey: string;
        runId: string;
        currentUserMessageId: number;
    }): RunChatRequest['history'] {
        const queue = this.chatQueueOrder.get(input.queueKey) ?? [];
        const currentIndex = queue.indexOf(input.runId);
        const excludedRunIds = new Set<string>(
            currentIndex >= 0 ? queue.slice(currentIndex) : [input.runId],
        );
        const windowSize = this.config.memory.max_history_messages + queue.length + 8;
        const messages = this.memoryStore.listMessages({
            channel: input.channel,
            chatId: input.chatId,
            limit: windowSize,
        });

        return messages
            .filter((message) => {
                if (message.id === input.currentUserMessageId) {
                    return false;
                }

                return !(
                    message.runId && excludedRunIds.has(message.runId)
                );
            })
            .slice(-this.config.memory.max_history_messages)
            .map((message) => ({
                role: message.role,
                content: message.content,
            }));
    }

    private buildEditedChatHistory(input: {
        channel: string;
        chatId: string;
        excludedRunId?: string;
    }): NonNullable<RunChatRequest['history']> {
        const windowSize = this.config.memory.max_history_messages + 8;
        const messages = this.memoryStore.listMessages({
            channel: input.channel,
            chatId: input.chatId,
            limit: windowSize,
        });

        return messages
            .filter(
                (message) =>
                    !input.excludedRunId || message.runId !== input.excludedRunId,
            )
            .slice(-this.config.memory.max_history_messages)
            .map((message) => ({
                role: message.role,
                content: message.content,
            }));
    }

    private async createRunLifecycleNote(
        state: RunState | undefined,
        run: StoredCommandRun | null,
        content: string,
        metadata: Record<string, unknown>,
    ): Promise<StoredMessage | null> {
        const baseMessage =
            (run ? this.memoryStore.listMessagesByRunId(run.runId, { includeRevoked: true })[0] : null) ??
            null;
        const channel = state?.channel ?? baseMessage?.channel;
        const chatId = state?.chatId ?? baseMessage?.chatId;

        if (!channel || !chatId) {
            return null;
        }

        return await this.createSystemMessage({
            channel,
            chatId,
            content,
            metadata,
        });
    }

    private async createSystemMessage(input: {
        channel: string;
        chatId: string;
        content: string;
        metadata?: Record<string, unknown>;
        runId?: string;
    }): Promise<StoredMessage> {
        const systemMessageInput: Parameters<MemoryStore['saveMessage']>[0] = {
            timestamp: new Date().toISOString(),
            channel: input.channel,
            chatId: input.chatId,
            userId: 'system',
            role: 'system',
            content: input.content,
        };
        if (input.metadata) {
            systemMessageInput.metadata = input.metadata;
        }
        if (input.runId) {
            systemMessageInput.runId = input.runId;
        }

        const message = this.memoryStore.saveMessage(systemMessageInput);

        await this.exportMessage(message);
        this.publishMessageEvent('message.created', message);
        return message;
    }

    private async completeBuiltInCommand(input: {
        runId: string;
        channel: string;
        chatId: string;
        userMessageId: number;
        content: string;
        duration: number;
        metadata?: Record<string, unknown>;
    }): Promise<ChatServiceResult> {
        const assistantMessageInput: Parameters<MemoryStore['saveMessage']>[0] = {
            timestamp: new Date().toISOString(),
            channel: input.channel,
            chatId: input.chatId,
            userId: 'willclaw',
            role: 'assistant',
            content: input.content,
            agent: 'willclaw',
            durationMs: input.duration,
            runId: input.runId,
        };
        if (input.metadata) {
            assistantMessageInput.metadata = input.metadata;
        }

        const assistantMessage = this.memoryStore.saveMessage(
            assistantMessageInput,
        );

        await this.exportMessage(assistantMessage);
        this.publishMessageEvent('message.created', assistantMessage);
        this.memoryStore.updateCommandRun(input.runId, {
            agent: 'willclaw',
            status: 'completed',
            durationMs: input.duration,
            stdout: input.content,
        });
        this.eventHub.publish('chat.run.completed', {
            runId: input.runId,
            channel: input.channel,
            chatId: input.chatId,
            agent: 'willclaw',
            durationMs: input.duration,
            assistantMessageId: assistantMessage.id,
        });

        const result: ChatServiceResult = {
            runId: input.runId,
            agent: 'willclaw',
            content: input.content,
            duration: input.duration,
            attemptedAgents: ['willclaw'],
            systemPromptChars: 0,
            promptSections: [],
            channel: input.channel,
            chatId: input.chatId,
            userMessageId: input.userMessageId,
            assistantMessageId: assistantMessage.id,
        };
        if (input.metadata) {
            result.metadata = input.metadata;
        }

        return result;
    }

    private async exportMessage(message: StoredMessage): Promise<void> {
        if (!this.historyExporter) {
            return;
        }

        await this.historyExporter.appendMessage(message);
    }

    private publishMessageEvent(type: string, message: StoredMessage): void {
        this.eventHub.publish(type, {
            message,
            messageId: message.id,
            runId: message.runId ?? null,
            channel: message.channel,
            chatId: message.chatId,
            role: message.role,
            status: message.status,
        });
    }
}
