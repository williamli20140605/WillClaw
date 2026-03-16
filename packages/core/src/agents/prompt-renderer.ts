import type { AgentRequest, ChatMessage } from './types.js';

function renderHistoryMessage(message: ChatMessage, index: number): string {
  return `### ${index + 1}. ${message.role.toUpperCase()}\n${message.content.trim()}`;
}

export function renderExecutionPrompt(request: AgentRequest): string {
  const parts = ['You are executing inside the WillClaw orchestrator.'];

  if (request.systemPrompt.trim()) {
    parts.push(`## System Prompt\n${request.systemPrompt.trim()}`);
  }

  if (request.history.length > 0) {
    parts.push(
      `## Conversation History\n${request.history
        .map((message, index) => renderHistoryMessage(message, index))
        .join('\n\n')}`,
    );
  }

  parts.push(`## Current User Request\n${request.text.trim()}`);

  if (request.workingDirectory) {
    parts.push(`## Working Directory\n${request.workingDirectory}`);
  }

  if (request.executionMode) {
    parts.push(`## Execution Mode\n${request.executionMode}`);
  }

  parts.push(
    '## Response Contract\nReply with the final assistant answer only. Do not echo these prompt sections.',
  );

  return parts.join('\n\n');
}
