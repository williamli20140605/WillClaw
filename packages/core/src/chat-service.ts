import { randomUUID } from 'node:crypto';

import type { Logger } from 'pino';

import type { WillClawConfig } from './config.js';
import type { CommandCompletionMonitor } from './completion-monitor.js';
import type { HistoryExporter } from './history-exporter.js';
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

interface ActiveRunState {
    runId: string;
    channel: string;
    chatId: string;
    userId: string;
    userMessageId: number;
    cancelRequested: boolean;
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

    constructor(
        private readonly config: WillClawConfig,
        private readonly orchestrator: Orchestrator,
        private readonly memoryStore: MemoryStore,
        private readonly historyExporter: HistoryExporter | null,
        private readonly completionMonitor: CommandCompletionMonitor,
        private readonly logger: Logger,
    ) { }

    async handleChat(request: ChatServiceRequest): Promise<ChatServiceResult> {
        const channel = request.channel ?? 'web';
        const chatId = request.chatId ?? 'default';
        const userId = request.userId ?? 'local-user';
        const runId = request.runId ?? randomUUID();
        const history =
            request.history ??
            this.memoryStore.getChatHistory({
                channel,
                chatId,
                limit: this.config.memory.max_history_messages,
            });
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
        this.memoryStore.saveCommandRun({
            runId,
            agent: 'orchestrator',
            chatId,
            prompt: request.text,
            status: 'running',
        });
        this.activeRuns.set(runId, {
            runId,
            channel,
            chatId,
            userId,
            userMessageId: userMessage.id,
            cancelRequested: false,
        });

        try {
            const result = await this.orchestrator.runChat({
                ...request,
                history,
                runId,
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
                userMessageId: userMessage.id,
                assistantMessageId: assistantMessage.id,
            };

            if (completionMessageId != null) {
                response.completionMessageId = completionMessageId;
            }

            return response;
        } catch (error) {
            const cancelled = this.isRunCancelled(runId) || error instanceof RunCancelledError;
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

            if (cancelled) {
                throw new RunCancelledError(runId);
            }

            throw error;
        } finally {
            this.activeRuns.delete(runId);
        }
    }

    getRunStatus(runId: string): RunStatusResult {
        return {
            run: this.memoryStore.getCommandRun(runId),
            active: this.activeRuns.has(runId) || this.orchestrator.isRunActive(runId),
        };
    }

    async cancelRun(
        runId: string,
        options?: {
            annotate?: boolean;
        },
    ): Promise<CancelRunResult> {
        const state = this.activeRuns.get(runId);
        if (state) {
            state.cancelRequested = true;
        }

        const cancelled = await this.orchestrator.cancelRun(runId);
        const run = this.memoryStore.getCommandRun(runId);

        if (!run && !state) {
            return {
                run: null,
                active: false,
                cancelled: false,
            };
        }

        const canCancel =
            Boolean(state) ||
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
                stderr: 'Cancelled by user request',
            }) ??
                run);
        const noteMessage =
            options?.annotate === false
                ? null
                : await this.createRunLifecycleNote(
                    state,
                    updatedRun ?? run,
                    `Cancelled run \`${runId}\`.`,
                    {
                        subtype: 'run_cancelled',
                        runId,
                    },
                );

        const response: CancelRunResult = {
            run: updatedRun ?? run,
            active: false,
            cancelled: cancelled || Boolean(state),
        };
        if (noteMessage) {
            response.noteMessageId = noteMessage.id;
        }

        return response;
    }

    async revokeMessage(messageId: number): Promise<RevokeMessagesResult | null> {
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
        const noteMessage = await this.createSystemMessage({
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
            noteMessageId: noteMessage.id,
        };
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

        const revoked = await this.revokeMessage(messageId);
        if (!revoked) {
            return null;
        }

        const result = await this.handleChat({
            ...request,
            channel: original.channel,
            chatId: original.chatId,
            userId: original.userId,
            text: request.text,
            editOf: original.id,
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
            revokedMessageIds: revoked.revokedMessageIds,
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
        return this.activeRuns.get(runId)?.cancelRequested ?? false;
    }

    private async createRunLifecycleNote(
        state: ActiveRunState | undefined,
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
        return message;
    }

    private async exportMessage(message: StoredMessage): Promise<void> {
        if (!this.historyExporter) {
            return;
        }

        await this.historyExporter.appendMessage(message);
    }
}
