import { randomUUID } from 'node:crypto';

import type { Logger } from 'pino';

import type { WillClawConfig } from './config.js';
import type { CommandCompletionMonitor } from './completion-monitor.js';
import type { HistoryExporter } from './history-exporter.js';
import type { MemoryStore, StoredMessage } from './memory.js';
import type {
  Orchestrator,
  RunChatRequest,
  RunChatResult,
} from './orchestrator.js';

export interface ChatServiceRequest extends RunChatRequest {
  channel?: string;
  chatId?: string;
  userId?: string;
}

export interface ChatServiceResult extends RunChatResult {
  channel: string;
  chatId: string;
  userMessageId: number;
  assistantMessageId: number;
  completionMessageId?: number;
}

export class ChatService {
  constructor(
    private readonly config: WillClawConfig,
    private readonly orchestrator: Orchestrator,
    private readonly memoryStore: MemoryStore,
    private readonly historyExporter: HistoryExporter | null,
    private readonly completionMonitor: CommandCompletionMonitor,
    private readonly logger: Logger,
  ) {}

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
    const userMessage = this.memoryStore.saveMessage({
      timestamp: new Date().toISOString(),
      channel,
      chatId,
      userId,
      role: 'user',
      content: request.text,
      runId,
    });

    await this.exportMessage(userMessage);

    try {
      const result = await this.orchestrator.runChat({
        ...request,
        history,
        runId,
      });
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
      const commandRunInput = {
        runId: result.runId,
        agent: result.agent,
        chatId,
        prompt: request.text,
        status: 'completed',
        durationMs: result.duration,
      } satisfies Omit<
        Parameters<MemoryStore['saveCommandRun']>[0],
        'exitCode' | 'stdout'
      >;

      if (result.exitCode != null) {
        (
          commandRunInput as Parameters<MemoryStore['saveCommandRun']>[0]
        ).exitCode = result.exitCode;
      }

      if (result.rawOutput) {
        (
          commandRunInput as Parameters<MemoryStore['saveCommandRun']>[0]
        ).stdout = result.rawOutput;
      }

      this.memoryStore.saveCommandRun(
        commandRunInput as Parameters<MemoryStore['saveCommandRun']>[0],
      );

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
        const storedCompletion = this.memoryStore.saveMessage({
          timestamp: new Date().toISOString(),
          channel,
          chatId,
          userId: 'system',
          role: 'system',
          content: completionMessage.content,
          metadata: completionMessage.metadata,
          runId: result.runId,
        });

        await this.exportMessage(storedCompletion);
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
      this.memoryStore.saveCommandRun({
        runId,
        agent: 'orchestrator',
        chatId,
        prompt: request.text,
        status: 'failed',
        stderr: error instanceof Error ? error.message : 'Unknown failure',
      });
      this.logger.error(
        {
          runId,
          channel,
          chatId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Chat execution failed',
      );
      throw error;
    }
  }

  private async exportMessage(message: StoredMessage): Promise<void> {
    if (!this.historyExporter) {
      return;
    }

    await this.historyExporter.appendMessage(message);
  }
}
