import type { ApiAgentPoolEntry } from '../config.js';

import { AgentExecutionError } from './errors.js';
import type {
  AgentBackend,
  AgentRequest,
  AgentResponse,
  ChatMessage,
} from './types.js';

function toAnthropicMessages(history: ChatMessage[], text: string) {
  const messages = history
    .filter(
      (message): message is ChatMessage & { role: 'user' | 'assistant' } =>
        message.role === 'user' || message.role === 'assistant',
    )
    .map((message) => ({
      role: message.role,
      content: [{ type: 'text', text: message.content }],
    }));

  messages.push({
    role: 'user',
    content: [{ type: 'text', text }],
  });

  return messages;
}

function readAnthropicText(payload: unknown): string {
  if (
    !payload ||
    typeof payload !== 'object' ||
    !('content' in payload) ||
    !Array.isArray(payload.content)
  ) {
    return '';
  }

  return payload.content
    .flatMap((item) => {
      if (
        item &&
        typeof item === 'object' &&
        'type' in item &&
        item.type === 'text' &&
        'text' in item &&
        typeof item.text === 'string'
      ) {
        return [item.text];
      }

      return [];
    })
    .join('\n\n')
    .trim();
}

export class DirectApiAgentBackend implements AgentBackend {
  readonly type = 'api' as const;
  private readonly activeRuns = new Map<string, AbortController>();

  constructor(
    readonly name: string,
    private readonly config: ApiAgentPoolEntry,
  ) {}

  async execute(request: AgentRequest): Promise<AgentResponse> {
    const apiKey = process.env[this.config.api_key_env];
    if (!apiKey) {
      throw new AgentExecutionError(
        `Missing API key in env ${this.config.api_key_env}`,
        {
          agent: this.name,
        },
      );
    }

    const controller = new AbortController();
    this.activeRuns.set(request.runId, controller);
    const startedAt = Date.now();

    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.config.model,
          max_tokens: this.config.max_tokens,
          system: request.systemPrompt,
          messages: toAnthropicMessages(request.history, request.text),
        }),
        signal: controller.signal,
      });

      const rawText = await response.text();
      if (!response.ok) {
        throw new AgentExecutionError(
          `Anthropic API returned ${response.status}`,
          {
            agent: this.name,
            stderr: rawText,
            exitCode: response.status,
          },
        );
      }

      const payload = JSON.parse(rawText) as unknown;

      const responsePayload: AgentResponse = {
        content: readAnthropicText(payload),
        agent: this.name,
        duration: Date.now() - startedAt,
        rawOutput: rawText,
      };

      if (payload && typeof payload === 'object') {
        responsePayload.metadata = payload as Record<string, unknown>;
      }

      return responsePayload;
    } catch (error) {
      if (error instanceof AgentExecutionError) {
        throw error;
      }

      throw new AgentExecutionError(
        error instanceof Error
          ? `Direct API request failed: ${error.message}`
          : 'Direct API request failed',
        {
          agent: this.name,
          cause: error,
        },
      );
    } finally {
      this.activeRuns.delete(request.runId);
    }
  }

  async cancel(runId: string): Promise<void> {
    const controller = this.activeRuns.get(runId);
    if (!controller) {
      return;
    }

    controller.abort();
    this.activeRuns.delete(runId);
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(process.env[this.config.api_key_env]);
  }
}
