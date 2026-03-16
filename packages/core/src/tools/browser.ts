import { execFile } from 'node:child_process';

import type { BrowserToolProvider, WillClawConfig } from '../config.js';
import type { ToolExecutionLogger } from '../tool-logger.js';

export interface BrowserToolContext {
  triggeredBy: string;
  chatId?: string;
  browserApp?: string;
  timeoutMs?: number;
}

export interface BrowserOpenResult {
  target: string;
  launcher: string;
  provider: BrowserToolProvider;
  exitCode: number;
}

interface BrowserCommand {
  provider: BrowserToolProvider;
  command: string;
  args: string[];
  launcher: string;
}

function normalizeBrowserTarget(target: string): string {
  const url = new URL(target);
  if (!['http:', 'https:', 'file:'].includes(url.protocol)) {
    throw new Error(`Unsupported browser target protocol: ${url.protocol}`);
  }

  return url.toString();
}

function resolveSystemOpenCommand(
  target: string,
  browserApp?: string,
): BrowserCommand {
  if (process.platform === 'darwin') {
    return {
      provider: 'system-open',
      command: 'open',
      args: browserApp ? ['-a', browserApp, target] : [target],
      launcher: browserApp ? `open -a ${browserApp}` : 'open',
    };
  }

  if (process.platform === 'linux') {
    if (browserApp) {
      return {
        provider: 'system-open',
        command: browserApp,
        args: [target],
        launcher: browserApp,
      };
    }

    return {
      provider: 'system-open',
      command: 'xdg-open',
      args: [target],
      launcher: 'xdg-open',
    };
  }

  throw new Error(
    `system-open browser provider is not implemented on platform: ${process.platform}`,
  );
}

function resolveBrowserCommand(
  config: WillClawConfig,
  target: string,
  context: BrowserToolContext,
  provider: BrowserToolProvider,
): BrowserCommand {
  if (provider === 'agent-browser') {
    const args = ['open', target];

    if (!config.tools.browser.headless) {
      args.push('--headed');
    }

    return {
      provider,
      command: 'agent-browser',
      args,
      launcher: 'agent-browser',
    };
  }

  return resolveSystemOpenCommand(target, context.browserApp);
}

function runCommand(
  command: BrowserCommand,
  timeoutMs?: number,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    execFile(
      command.command,
      command.args,
      {
        timeout: timeoutMs,
      },
      (error, _stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }

        resolve();
      },
    );
  });
}

export class BrowserTool {
  constructor(
    private readonly config: WillClawConfig,
    private readonly toolLogger: ToolExecutionLogger,
  ) {}

  async openUrl(
    target: string,
    context: BrowserToolContext,
  ): Promise<BrowserOpenResult> {
    const normalizedTarget = normalizeBrowserTarget(target);
    const failures: string[] = [];

    for (const provider of this.config.tools.browser.providers) {
      const startedAt = Date.now();

      try {
        const command = resolveBrowserCommand(
          this.config,
          normalizedTarget,
          context,
          provider,
        );
        await runCommand(command, context.timeoutMs);
        this.toolLogger.log({
          tool: 'browser',
          action: 'open_url',
          agent: context.triggeredBy,
          chatId: context.chatId,
          input: normalizedTarget,
          output: `provider=${provider} launcher=${command.launcher}`,
          durationMs: Date.now() - startedAt,
          success: true,
        });

        return {
          target: normalizedTarget,
          launcher: command.launcher,
          provider,
          exitCode: 0,
        };
      } catch (error) {
        const detail =
          error instanceof Error ? error.message : 'Unknown browser tool error';
        failures.push(`${provider}: ${detail}`);
        this.toolLogger.log({
          tool: 'browser',
          action: 'open_url',
          agent: context.triggeredBy,
          chatId: context.chatId,
          input: normalizedTarget,
          output: `provider=${provider}`,
          durationMs: Date.now() - startedAt,
          success: false,
          error: detail,
        });
      }
    }

    throw new Error(
      `Browser host tool failed across providers: ${failures.join('; ')}`,
    );
  }
}
