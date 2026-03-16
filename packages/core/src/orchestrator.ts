import { randomUUID } from 'node:crypto';

import type { Logger } from 'pino';

import type { WillClawConfig } from './config.js';
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
  runId?: string;
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

export class Orchestrator {
  constructor(
    private readonly config: WillClawConfig,
    private readonly paths: WillClawPaths,
    private readonly promptAssembler: PromptAssembler,
    private readonly agents: Map<string, AgentBackend>,
    private readonly logger: Logger,
  ) {}

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

    const explicit = stripExplicitAgent(trimmedText, this.agents.keys());
    const userText = explicit.text || trimmedText;
    const selectedAgent = explicit.explicitAgent
      ? explicit.explicitAgent
      : this.selectAgent(userText);
    const allowFallback =
      !explicit.explicitAgent &&
      (!looksLikeMutatingRequest(userText) ||
        this.config.agents.safety.mutating_fallback);
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
      text: userText,
      systemPrompt,
      history: request.history ?? [],
      executionMode: request.executionMode ?? 'foreground',
    };

    if (request.workingDirectory) {
      agentRequest.workingDirectory = request.workingDirectory;
    }

    for (const agentName of this.buildFallbackChain(
      selectedAgent,
      allowFallback,
    )) {
      const backend = this.agents.get(agentName);
      attemptedAgents.push(agentName);

      if (!backend) {
        attemptedErrors.push(`${agentName}: backend not configured`);
        if (explicit.explicitAgent) {
          break;
        }
        continue;
      }

      if (!(await backend.isAvailable())) {
        attemptedErrors.push(`${agentName}: unavailable`);
        if (explicit.explicitAgent) {
          break;
        }
        continue;
      }

      this.logger.info(
        {
          runId: agentRequest.runId,
          selectedAgent: agentName,
          requestedAgent: explicit.explicitAgent,
          workingDirectory: request.workingDirectory ?? this.paths.homeDir,
        },
        'Dispatching chat request to agent',
      );

      try {
        const response = await backend.execute(agentRequest);
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

        if (!allowFallback || explicit.explicitAgent) {
          throw error;
        }
      }
    }

    throw new Error(
      `All agent attempts failed: ${attemptedErrors.join('; ') || 'no available agents'}`,
    );
  }

  getAgentToolPolicy(agentName: string): ResolvedAgentToolPolicy {
    return resolveAgentToolPolicy(this.config, agentName);
  }

  canUseHostedTool(agentName: string, toolName: keyof ResolvedAgentToolPolicy): boolean {
    return getAgentToolMode(this.config, agentName, toolName) === 'hosted';
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
