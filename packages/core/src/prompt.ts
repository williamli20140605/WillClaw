import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { WillClawConfig } from './config.js';
import type { WillClawPaths } from './paths.js';

export type PromptTrigger = 'chat' | 'heartbeat';

type BootstrapCondition = 'always' | 'private_chat' | 'heartbeat';

interface BootstrapEntry {
  fileName: string;
  condition: BootstrapCondition;
}

export interface PromptSection {
  name: string;
  source: 'file' | 'runtime';
  filePath?: string;
  chars: number;
  truncated: boolean;
}

export interface AssemblePromptOptions {
  trigger?: PromptTrigger;
  isGroup?: boolean;
  currentMode?: string;
  now?: Date;
  extraFiles?: string[];
}

export interface AssemblePromptResult {
  systemPrompt: string;
  sections: PromptSection[];
  totalChars: number;
  truncated: boolean;
}

const BOOTSTRAP_SEQUENCE: BootstrapEntry[] = [
  { fileName: 'IDENTITY.md', condition: 'always' },
  { fileName: 'AGENTS.md', condition: 'always' },
  { fileName: 'RULES.md', condition: 'always' },
  { fileName: 'WORK_MODES.md', condition: 'always' },
  { fileName: 'SKILLS.md', condition: 'always' },
  { fileName: 'SKILLS_INDEX.md', condition: 'always' },
  { fileName: 'MEMORY.md', condition: 'private_chat' },
  { fileName: 'HEARTBEAT.md', condition: 'heartbeat' },
  { fileName: 'PROJECT_HEARTBEAT.md', condition: 'heartbeat' },
];

function shouldIncludeEntry(
  entry: BootstrapEntry,
  options: Required<Pick<AssemblePromptOptions, 'trigger' | 'isGroup'>>,
): boolean {
  if (entry.condition === 'always') {
    return true;
  }

  if (entry.condition === 'private_chat') {
    return options.trigger === 'chat' && !options.isGroup;
  }

  return options.trigger === 'heartbeat';
}

function truncateText(
  content: string,
  maxChars: number,
): {
  content: string;
  truncated: boolean;
} {
  if (content.length <= maxChars) {
    return {
      content,
      truncated: false,
    };
  }

  const marker = '\n\n[Truncated by WillClaw prompt limits]';
  const sliceLength = Math.max(0, maxChars - marker.length);

  return {
    content: `${content.slice(0, sliceLength)}${marker}`,
    truncated: true,
  };
}

function buildRuntimeContext(options: Required<AssemblePromptOptions>): string {
  const lines = [
    `current_time: ${options.now.toISOString()}`,
    `trigger: ${options.trigger}`,
    `conversation_scope: ${options.isGroup ? 'group' : 'private'}`,
  ];

  if (options.currentMode) {
    lines.push(`work_mode: ${options.currentMode}`);
  }

  return lines.join('\n');
}

async function readOptionalFile(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

function normalizeSectionText(title: string, content: string): string {
  return `## ${title}\n${content.trim()}`;
}

export class PromptAssembler {
  constructor(
    private readonly config: WillClawConfig,
    private readonly paths: WillClawPaths,
  ) {}

  async assembleSystemPrompt(
    options?: AssemblePromptOptions,
  ): Promise<AssemblePromptResult> {
    const resolvedOptions: Required<AssemblePromptOptions> = {
      trigger: options?.trigger ?? 'chat',
      isGroup: options?.isGroup ?? false,
      currentMode: options?.currentMode ?? '',
      now: options?.now ?? new Date(),
      extraFiles: options?.extraFiles ?? [],
    };
    const sections: PromptSection[] = [];
    const chunks: string[] = [];
    let remainingChars = this.config.workspace.bootstrapTotalMaxChars;
    let truncated = false;
    const fileNames = new Set(
      BOOTSTRAP_SEQUENCE.filter((entry) =>
        shouldIncludeEntry(entry, resolvedOptions),
      ).map((entry) => entry.fileName),
    );

    for (const extraFile of resolvedOptions.extraFiles) {
      fileNames.add(extraFile);
    }

    for (const fileName of fileNames) {
      if (remainingChars <= 0) {
        truncated = true;
        break;
      }

      const filePath = path.join(this.paths.workspaceDir, fileName);
      const fileContent = await readOptionalFile(filePath);
      if (!fileContent || !fileContent.trim()) {
        continue;
      }

      const perFileLimit = Math.min(
        this.config.workspace.bootstrapMaxChars,
        remainingChars,
      );
      const truncatedFile = truncateText(fileContent, perFileLimit);
      const sectionText = normalizeSectionText(fileName, truncatedFile.content);
      const boundedSection = truncateText(sectionText, remainingChars);

      if (!boundedSection.content.trim()) {
        truncated = true;
        break;
      }

      chunks.push(boundedSection.content);
      sections.push({
        name: fileName,
        source: 'file',
        filePath,
        chars: boundedSection.content.length,
        truncated: truncatedFile.truncated || boundedSection.truncated,
      });
      remainingChars -= boundedSection.content.length;
      truncated =
        truncated || truncatedFile.truncated || boundedSection.truncated;
    }

    if (remainingChars > 0) {
      const runtimeSectionText = normalizeSectionText(
        'Runtime Context',
        buildRuntimeContext(resolvedOptions),
      );
      const boundedRuntime = truncateText(runtimeSectionText, remainingChars);

      if (boundedRuntime.content.trim()) {
        chunks.push(boundedRuntime.content);
        sections.push({
          name: 'Runtime Context',
          source: 'runtime',
          chars: boundedRuntime.content.length,
          truncated: boundedRuntime.truncated,
        });
        remainingChars -= boundedRuntime.content.length;
        truncated = truncated || boundedRuntime.truncated;
      }
    }

    const systemPrompt = chunks.join('\n\n').trim();

    return {
      systemPrompt,
      sections,
      totalChars: systemPrompt.length,
      truncated: truncated || remainingChars <= 0,
    };
  }
}
