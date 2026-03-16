import type { WillClawConfig } from './config.js';

export interface CompletionMessage {
  content: string;
  metadata: Record<string, unknown>;
}

export class CommandCompletionMonitor {
  constructor(private readonly config: WillClawConfig) {}

  buildCompletionMessage(input: {
    agent: string;
    executionMode: 'foreground' | 'background';
    durationMs: number;
    exitCode?: number;
    output?: string;
  }): CompletionMessage | null {
    const agentConfig = this.config.agents.pool[input.agent];
    if (!agentConfig || agentConfig.type !== 'cli') {
      return null;
    }

    if (
      agentConfig.completion_notify !== 'background_only' ||
      input.executionMode !== 'background'
    ) {
      return null;
    }

    const preview = (input.output ?? '').trim().slice(0, 500);
    const duration = (input.durationMs / 1000).toFixed(1);
    const exitCode = input.exitCode ?? 0;
    const success = exitCode === 0;

    return {
      content: success
        ? `✅ [${input.agent}] 完成 (${duration}s)\n输出: ${preview || '(empty)'}`
        : `❌ [${input.agent}] 失败 (exit=${exitCode}, ${duration}s)\n错误: ${preview || '(empty)'}`,
      metadata: {
        subtype: 'command_completion',
        agent: input.agent,
        exitCode,
        durationMs: input.durationMs,
        outputPreview: preview,
      },
    };
  }
}
