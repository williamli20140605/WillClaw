import type { AgentToolMode, HostToolName } from '../config.js';

export type ChatRole = 'user' | 'assistant' | 'system';
export type AgentBackendType = 'cli' | 'api' | 'acp';
export type ExecutionMode = 'foreground' | 'background';
export type AgentTextStreamParser =
    | 'plain_text'
    | 'structured_json'
    | 'linewise_json'
    | 'event_stream'
    | 'anthropic_sse';

export interface ChatMessage {
    role: ChatRole;
    content: string;
}

export interface AgentTextStreamUpdate {
    content: string;
    delta: string;
    mode: 'delta' | 'snapshot';
    parser: AgentTextStreamParser;
    eventTypes?: string[];
}

export interface AgentRequest {
    runId: string;
    text: string;
    systemPrompt: string;
    history: ChatMessage[];
    channel?: string;
    chatId?: string;
    workingDirectory?: string;
    executionMode?: ExecutionMode;
    memorySearch?: {
        enabled: boolean;
        maxCalls: number;
    };
    hostedActionBridge?: {
        enabled: boolean;
        maxCalls: number;
        tools: Array<'browser' | 'screen'>;
        allowedActions?: Partial<Record<'browser' | 'screen', string[]>>;
    };
    onTextStream?: (update: AgentTextStreamUpdate) => void;
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
