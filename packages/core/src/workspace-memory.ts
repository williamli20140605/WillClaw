import { readdir } from 'node:fs/promises';
import path from 'node:path';

import type { AgentBackend } from './agents/types.js';
import type { WillClawConfig } from './config.js';
import type { FileSystemTool } from './tools/filesystem.js';
import type { Logger } from 'pino';

import type { PromptAssembler } from './prompt.js';
import type {
    IndexedFileRecord,
    MemoryStore,
    SearchFileResult,
    SearchMessageResult,
    StoredMessage,
} from './memory.js';
import type { WillClawPaths } from './paths.js';

function toDateKey(input?: Date | string): string {
    if (!input) {
        return new Date().toISOString().slice(0, 10);
    }

    if (typeof input === 'string') {
        return input;
    }

    return input.toISOString().slice(0, 10);
}

function buildDayRange(dateKey: string): { from: string; to: string } {
    const from = new Date(`${dateKey}T00:00:00.000Z`);
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 1);

    return {
        from: from.toISOString(),
        to: to.toISOString(),
    };
}

function buildDailyNoteSkeleton(dateKey: string): string {
    return `# ${dateKey}

## Summary

## Notable Messages
`;
}

function buildEmptyMemorySkeleton(): string {
    return `# Memory

## Stable Facts

## Preferences

## Ongoing Work
`;
}

function toChatHistory(messages: StoredMessage[]) {
  return messages
    .filter(
      (
        message,
      ): message is StoredMessage & { role: 'user' | 'assistant' } =>
        message.role === 'user' || message.role === 'assistant',
    )
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
}

export interface MemorySearchResult {
    messages: SearchMessageResult[];
    files: SearchFileResult[];
}

export interface DailyNoteState {
    dateKey: string;
    filePath: string;
    created: boolean;
    content: string;
    indexedFile: IndexedFileRecord;
}

export interface GeneratedDailyNoteResult extends DailyNoteState {
    runId?: string;
    agent?: string;
}

export interface MemoryCompactResult {
    filePath: string;
    content: string;
    indexedFile: IndexedFileRecord;
    runId?: string;
    agent?: string;
}

export class WorkspaceMemoryManager {
    constructor(
        private readonly config: WillClawConfig,
        private readonly paths: WillClawPaths,
        private readonly promptAssembler: PromptAssembler,
        private readonly agents: Map<string, AgentBackend>,
        private readonly memoryStore: MemoryStore,
        private readonly fileSystemTool: FileSystemTool,
        private readonly logger: Logger,
    ) { }

    async reindexWorkspaceMemory(): Promise<{
        files: IndexedFileRecord[];
    }> {
        const files: IndexedFileRecord[] = [];

        const memoryFilePath = path.join(this.paths.workspaceDir, 'MEMORY.md');
        const memoryContent = await this.readOptionalText(memoryFilePath);
        if (memoryContent != null) {
            files.push(
                this.memoryStore.upsertIndexedFile({
                    filepath: memoryFilePath,
                    fileType: 'memory',
                    content: memoryContent,
                }),
            );
        }

        await this.fileSystemTool.mkdir(this.paths.workspaceMemoryDir, {
            triggeredBy: 'system',
        });
        const entries = await readdir(this.paths.workspaceMemoryDir, {
            withFileTypes: true,
        });
        for (const entry of entries) {
            if (!entry.isFile() || !entry.name.endsWith('.md')) {
                continue;
            }

            const filePath = path.join(this.paths.workspaceMemoryDir, entry.name);
            const content = await this.readOptionalText(filePath);
            if (content == null) {
                continue;
            }

            files.push(
                this.memoryStore.upsertIndexedFile({
                    filepath: filePath,
                    fileType: 'daily_note',
                    content,
                }),
            );
        }

        return { files };
    }

  search(
        query: string,
        options?: {
            channel?: string;
            chatId?: string;
            messageLimit?: number;
            fileLimit?: number;
            fileType?: string;
        },
  ): MemorySearchResult {
    const messageOptions: Parameters<MemoryStore['searchMessages']>[1] = {
      limit: options?.messageLimit ?? 10,
    };
    const fileOptions: Parameters<MemoryStore['searchIndexedFiles']>[1] = {
      limit: options?.fileLimit ?? 10,
    };
    if (options?.channel) {
      messageOptions.channel = options.channel;
    }
    if (options?.chatId) {
      messageOptions.chatId = options.chatId;
    }
    if (options?.fileType) {
      fileOptions.fileType = options.fileType;
    }

    return {
      messages: this.memoryStore.searchMessages(query, messageOptions),
      files: this.memoryStore.searchIndexedFiles(query, fileOptions),
    };
  }

    async ensureDailyNote(options?: {
        date?: Date | string;
    }): Promise<DailyNoteState> {
        const dateKey = toDateKey(options?.date);
        const filePath = path.join(this.paths.workspaceMemoryDir, `${dateKey}.md`);
        let content = await this.readOptionalText(filePath);
        let created = false;

        await this.fileSystemTool.mkdir(this.paths.workspaceMemoryDir, {
            triggeredBy: 'system',
        });

        if (content == null) {
            content = buildDailyNoteSkeleton(dateKey);
            await this.fileSystemTool.writeText(filePath, content, {
                triggeredBy: 'system',
            });
            created = true;
        }

        const indexedFile = this.memoryStore.upsertIndexedFile({
            filepath: filePath,
            fileType: 'daily_note',
            content,
        });

        return {
            dateKey,
            filePath,
            created,
            content,
            indexedFile,
        };
    }

  async generateDailyNote(options?: {
    date?: Date | string;
    agentName?: string;
    workingDirectory?: string;
  }): Promise<GeneratedDailyNoteResult> {
    const ensureOptions: Parameters<WorkspaceMemoryManager['ensureDailyNote']>[0] =
      {};
    if (options?.date) {
      ensureOptions.date = options.date;
    }
    const current = await this.ensureDailyNote(ensureOptions);
        const range = buildDayRange(current.dateKey);
        const messages = this.memoryStore.listMessages({
            from: range.from,
            to: range.to,
            limit: 200,
        });

        if (messages.length === 0) {
            return current;
        }

    const dailyNoteTask: Parameters<WorkspaceMemoryManager['runMemoryAgent']>[0] = {
      taskName: 'daily_note',
      history: toChatHistory(messages),
      prompt:
        `请把 ${current.dateKey} 这一天的对话整理成简洁的 Markdown 日志。` +
        '输出只包含最终 daily note，不要解释。',
    };
    if (options?.agentName) {
      dailyNoteTask.agentName = options.agentName;
    }
    if (options?.workingDirectory) {
      dailyNoteTask.workingDirectory = options.workingDirectory;
    }

    const generated = await this.runMemoryAgent(dailyNoteTask);
        await this.fileSystemTool.writeText(current.filePath, generated.content, {
            triggeredBy: generated.agent,
        });
        const indexedFile = this.memoryStore.upsertIndexedFile({
            filepath: current.filePath,
            fileType: 'daily_note',
            content: generated.content,
        });

        return {
            ...current,
            content: generated.content,
            created: false,
            indexedFile,
            runId: generated.runId,
            agent: generated.agent,
        };
    }

    async compactMemory(options?: {
        agentName?: string;
        workingDirectory?: string;
        limit?: number;
    }): Promise<MemoryCompactResult> {
        const filePath = path.join(this.paths.workspaceDir, 'MEMORY.md');
        const history = toChatHistory(
            this.memoryStore.listMessages({
                limit: options?.limit ?? Math.max(50, this.config.memory.max_history_messages * 5),
            }),
        );

        if (history.length === 0) {
            const content =
                (await this.readOptionalText(filePath)) ?? buildEmptyMemorySkeleton();
            if (!(await this.readOptionalText(filePath))) {
                await this.fileSystemTool.writeText(filePath, content, {
                    triggeredBy: 'system',
                });
            }
            const indexedFile = this.memoryStore.upsertIndexedFile({
                filepath: filePath,
                fileType: 'memory',
                content,
            });

            return {
                filePath,
                content,
                indexedFile,
            };
        }

    const memoryTask: Parameters<WorkspaceMemoryManager['runMemoryAgent']>[0] = {
      taskName: 'memory_compact',
      history,
      prompt:
        '根据以上最近对话更新 MEMORY.md。只保留稳定事实、偏好、长期约束和正在进行的重要事项。输出纯 Markdown，不要解释。',
    };
    if (options?.agentName) {
      memoryTask.agentName = options.agentName;
    }
    if (options?.workingDirectory) {
      memoryTask.workingDirectory = options.workingDirectory;
    }

    const generated = await this.runMemoryAgent(memoryTask);

        await this.fileSystemTool.writeText(filePath, generated.content, {
            triggeredBy: generated.agent,
        });
        const indexedFile = this.memoryStore.upsertIndexedFile({
            filepath: filePath,
            fileType: 'memory',
            content: generated.content,
        });

        return {
            filePath,
            content: generated.content,
            indexedFile,
            runId: generated.runId,
            agent: generated.agent,
        };
    }

    private async runMemoryAgent(input: {
        taskName: string;
        prompt: string;
        history: Array<{ role: 'user' | 'assistant'; content: string }>;
        agentName?: string;
        workingDirectory?: string;
    }): Promise<{
        runId: string;
        agent: string;
        content: string;
    }> {
        const agentName =
            input.agentName ??
            this.config.heartbeat.agent ??
            this.config.agents.default;
        const backend = this.agents.get(agentName);
        if (!backend) {
            throw new Error(`Agent ${agentName} is not configured.`);
        }

        if (!(await backend.isAvailable())) {
            throw new Error(`Agent ${agentName} is not available.`);
        }

        const runId = `${input.taskName}-${Date.now()}`;
        this.memoryStore.saveCommandRun({
            runId,
            agent: agentName,
            chatId: 'memory',
            prompt: input.prompt,
            status: 'running',
        });

        try {
            const promptResult = await this.promptAssembler.assembleSystemPrompt({
                trigger: 'chat',
                currentMode: input.taskName,
            });
            const request: Parameters<AgentBackend['execute']>[0] = {
                runId,
                text: input.prompt,
                systemPrompt: promptResult.systemPrompt,
                history: input.history,
                executionMode: 'background',
            };
            if (input.workingDirectory) {
                request.workingDirectory = input.workingDirectory;
            }

            const response = await backend.execute(request);
            const updates: Partial<Parameters<MemoryStore['saveCommandRun']>[0]> = {
                agent: response.agent,
                status: 'completed',
                durationMs: response.duration,
            };
            if (response.exitCode != null) {
                updates.exitCode = response.exitCode;
            }
            if (response.rawOutput) {
                updates.stdout = response.rawOutput;
            }
            this.memoryStore.updateCommandRun(runId, updates);

            return {
                runId,
                agent: response.agent,
                content: response.content,
            };
        } catch (error) {
            const detail =
                error instanceof Error ? error.message : 'Unknown memory task error';
            this.memoryStore.updateCommandRun(runId, {
                status: 'failed',
                stderr: detail,
            });
            this.logger.error(
                {
                    taskName: input.taskName,
                    runId,
                    error: detail,
                },
                'Workspace memory task failed',
            );
            throw error;
        }
    }

    private async readOptionalText(filePath: string): Promise<string | null> {
        try {
            return await this.fileSystemTool.readText(filePath, {
                triggeredBy: 'system',
            });
        } catch (error) {
            if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
                return null;
            }

            throw error;
        }
    }
}
