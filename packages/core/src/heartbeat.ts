import { randomUUID } from 'node:crypto';

import type { Logger } from 'pino';

import type { AgentBackend } from './agents/types.js';
import type { ChannelNotifier } from './channels/types.js';
import type { WillClawConfig } from './config.js';
import type { HistoryExporter } from './history-exporter.js';
import type { MemoryStore, StoredMessage } from './memory.js';
import type { PromptAssembler, PromptTrigger } from './prompt.js';

export type BackgroundTaskKind = 'heartbeat' | 'cron';

export interface BackgroundTaskResult {
    runId: string;
    kind: BackgroundTaskKind;
    taskName: string;
    agent: string;
    channel: string;
    chatId: string;
    content: string;
    durationMs: number;
    suppressed: boolean;
    notified?: boolean;
    messageId?: number;
    exitCode?: number;
}

function isHeartbeatOk(content: string): boolean {
    return content.trim() === 'HEARTBEAT_OK';
}

function resolveTarget(
    config: WillClawConfig,
    kind: BackgroundTaskKind,
    taskName: string,
    notify: string | null | undefined,
): {
    channel: string;
    chatId: string;
} {
    if (notify === 'web') {
        return {
            channel: 'web',
            chatId: 'default',
        };
    }

    if (notify === 'telegram') {
        const ownerId = config.channels.telegram.owner_id;
        if (ownerId > 0) {
            return {
                channel: 'telegram',
                chatId: String(ownerId),
            };
        }
    }

    if (notify) {
        return {
            channel: notify,
            chatId: taskName,
        };
    }

    return {
        channel: 'cron',
        chatId: kind === 'heartbeat' ? 'heartbeat' : taskName,
    };
}

export class BackgroundTaskEngine {
    private channelNotifier: ChannelNotifier | null = null;

    constructor(
        private readonly config: WillClawConfig,
        private readonly promptAssembler: PromptAssembler,
        private readonly agents: Map<string, AgentBackend>,
        private readonly memoryStore: MemoryStore,
        private readonly historyExporter: HistoryExporter | null,
        private readonly logger: Logger,
    ) { }

    setChannelNotifier(notifier: ChannelNotifier | null): void {
        this.channelNotifier = notifier;
    }

    listCronTasks(): Array<{
        name: string;
        schedule: string;
        agent: string;
        prompt: string;
        notify: string | null;
    }> {
        return Object.entries(this.config.cron).map(([name, entry]) => ({
            name,
            schedule: entry.schedule,
            agent: entry.agent,
            prompt: entry.prompt,
            notify: entry.notify ?? null,
        }));
    }

    async runHeartbeat(options?: {
        now?: Date;
        workingDirectory?: string;
    }): Promise<BackgroundTaskResult> {
        const input: Parameters<BackgroundTaskEngine['runTask']>[0] = {
            kind: 'heartbeat',
            taskName: 'heartbeat',
            agentName: this.config.heartbeat.agent,
            trigger: 'heartbeat',
            prompt:
                `现在是 ${(options?.now ?? new Date()).toISOString()}。` +
                '执行心跳检查。如果没有需要做的事情，回复 HEARTBEAT_OK。',
            notify: this.config.heartbeat.notify,
            silentOk: this.config.heartbeat.silent_ok,
            extraFiles: this.config.heartbeat.inject_files,
        };
        if (options?.workingDirectory) {
            input.workingDirectory = options.workingDirectory;
        }
        if (options?.now) {
            input.now = options.now;
        }

        return await this.runTask(input);
    }

    async runCronTask(
        taskName: string,
        options?: {
            now?: Date;
            workingDirectory?: string;
        },
    ): Promise<BackgroundTaskResult> {
        const entry = this.config.cron[taskName];
        if (!entry) {
            throw new Error(`Unknown cron task: ${taskName}`);
        }

        const input: Parameters<BackgroundTaskEngine['runTask']>[0] = {
            kind: 'cron',
            taskName,
            agentName: entry.agent,
            trigger: 'chat',
            prompt: entry.prompt,
            notify: entry.notify ?? null,
            silentOk: false,
        };
        if (options?.workingDirectory) {
            input.workingDirectory = options.workingDirectory;
        }
        if (options?.now) {
            input.now = options.now;
        }

        return await this.runTask(input);
    }

    private async runTask(input: {
        kind: BackgroundTaskKind;
        taskName: string;
        agentName: string;
        trigger: PromptTrigger;
        prompt: string;
        notify: string | null | undefined;
        silentOk: boolean;
        workingDirectory?: string;
        now?: Date;
        extraFiles?: string[];
    }): Promise<BackgroundTaskResult> {
        const backend = this.agents.get(input.agentName);
        if (!backend) {
            throw new Error(`Agent ${input.agentName} is not configured.`);
        }

        if (!(await backend.isAvailable())) {
            throw new Error(`Agent ${input.agentName} is not available.`);
        }

        const runId = randomUUID();
        const target = resolveTarget(
            this.config,
            input.kind,
            input.taskName,
            input.notify,
        );

        this.memoryStore.saveCommandRun({
            runId,
            agent: input.agentName,
            chatId: target.chatId,
            prompt: input.prompt,
            status: 'running',
        });

        try {
            const promptOptions: Parameters<
                PromptAssembler['assembleSystemPrompt']
            >[0] = {
                trigger: input.trigger,
                currentMode: input.kind,
                extraFiles: input.extraFiles ?? [],
            };
            if (input.now) {
                promptOptions.now = input.now;
            }

            const promptResult =
                await this.promptAssembler.assembleSystemPrompt(promptOptions);
            const agentRequest: Parameters<AgentBackend['execute']>[0] = {
                runId,
                text: input.prompt,
                systemPrompt: promptResult.systemPrompt,
                history: [],
                executionMode: 'background',
            };
            if (input.workingDirectory) {
                agentRequest.workingDirectory = input.workingDirectory;
            }

            const response = await backend.execute(agentRequest);

            const result: BackgroundTaskResult = {
                runId,
                kind: input.kind,
                taskName: input.taskName,
                agent: response.agent,
                channel: target.channel,
                chatId: target.chatId,
                content: response.content,
                durationMs: response.duration,
                suppressed:
                    input.kind === 'heartbeat' &&
                    input.silentOk &&
                    isHeartbeatOk(response.content),
            };
            if (response.exitCode != null) {
                result.exitCode = response.exitCode;
            }

            const runUpdate: Partial<Parameters<MemoryStore['saveCommandRun']>[0]> = {
                agent: response.agent,
                status: 'completed',
                durationMs: response.duration,
            };
            if (response.exitCode != null) {
                runUpdate.exitCode = response.exitCode;
            }
            if (response.rawOutput) {
                runUpdate.stdout = response.rawOutput;
            }

            this.memoryStore.updateCommandRun(runId, runUpdate);

            if (!result.suppressed) {
                const storedMessage = await this.saveSystemMessage({
                    channel: target.channel,
                    chatId: target.chatId,
                    content: response.content,
                    runId,
                    metadata: {
                        subtype: input.kind,
                        taskName: input.taskName,
                        agent: response.agent,
                        durationMs: response.duration,
                    },
                });
                result.messageId = storedMessage.id;
                result.notified = await this.notifyChannel(
                    target.channel,
                    target.chatId,
                    response.content,
                );
            }

            this.logger.info(
                {
                    kind: input.kind,
                    taskName: input.taskName,
                    runId,
                    suppressed: result.suppressed,
                    channel: target.channel,
                    chatId: target.chatId,
                },
                'Background task completed',
            );

            return result;
        } catch (error) {
            const detail =
                error instanceof Error ? error.message : 'Unknown background task error';

            this.memoryStore.updateCommandRun(runId, {
                status: 'failed',
                stderr: detail,
            });
            const failureMessage = `${input.kind} task failed: ${detail}`;
            await this.saveSystemMessage({
                channel: target.channel,
                chatId: target.chatId,
                content: failureMessage,
                metadata: {
                    subtype: `${input.kind}_error`,
                    taskName: input.taskName,
                    agent: input.agentName,
                },
            });
            await this.notifyChannel(target.channel, target.chatId, failureMessage);
            this.logger.error(
                {
                    kind: input.kind,
                    taskName: input.taskName,
                    runId,
                    error: detail,
                },
                'Background task failed',
            );
            throw error;
        }
    }

    private async saveSystemMessage(input: {
        channel: string;
        chatId: string;
        content: string;
        metadata?: Record<string, unknown>;
        runId?: string;
    }): Promise<StoredMessage> {
        const messageInput: Parameters<MemoryStore['saveMessage']>[0] = {
            timestamp: new Date().toISOString(),
            channel: input.channel,
            chatId: input.chatId,
            userId: 'system',
            role: 'system',
            content: input.content,
        };
        if (input.metadata) {
            messageInput.metadata = input.metadata;
        }
        if (input.runId) {
            messageInput.runId = input.runId;
        }

        const message = this.memoryStore.saveMessage(messageInput);
        if (this.historyExporter) {
            await this.historyExporter.appendMessage(message);
        }

        return message;
    }

    private async notifyChannel(
        channel: string,
        chatId: string,
        content: string,
    ): Promise<boolean> {
        if (!this.channelNotifier || channel === 'web') {
            return false;
        }

        try {
            return await this.channelNotifier.sendMessage(channel, chatId, content);
        } catch (error) {
            this.logger.warn(
                {
                    channel,
                    chatId,
                    error: error instanceof Error ? error.message : String(error),
                },
                'Background task notification failed',
            );
            return false;
        }
    }
}
