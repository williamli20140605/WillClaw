import type { AgentToolMode, HostToolName } from '../config.js';

export type ChatRole = 'user' | 'assistant' | 'system';
export type AgentBackendType = 'cli' | 'api' | 'acp';
export type ExecutionMode = 'foreground' | 'background';

export interface ChatMessage {
    role: ChatRole;
    content: string;
}

export interface AgentRequest {
    runId: string;
    text: string;
    systemPrompt: string;
    history: ChatMessage[];
    workingDirectory?: string;
    executionMode?: ExecutionMode;
}

export interface AgentResponse {
    content: string;
    agent: string;
    duration: number;
    exitCode?: number;
    rawOutput?: string;
    metadata?: Record<string, unknown>;
}

export interface AgentAvailability {
    name: string;
    type: AgentBackendType;
    enabled: boolean;
    available: boolean;
    toolPolicies: Record<HostToolName, AgentToolMode>;
    detail?: string;
}

export interface AgentBackend {
    readonly name: string;
    readonly type: AgentBackendType;

    execute(request: AgentRequest): Promise<AgentResponse>;
    cancel(runId: string): Promise<void>;
    isAvailable(): Promise<boolean>;
}
