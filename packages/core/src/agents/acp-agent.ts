import type { AcpAgentPoolEntry } from '../config.js';

import { AgentExecutionError } from './errors.js';
import type { AgentBackend, AgentRequest, AgentResponse } from './types.js';
import { extractTextFromStructuredOutput } from './structured-output.js';

export class AcpAgentBackend implements AgentBackend {
    readonly type = 'acp' as const;
    private readonly activeRuns = new Map<string, AbortController>();

    constructor(
        readonly name: string,
        private readonly config: AcpAgentPoolEntry,
    ) { }

    async execute(request: AgentRequest): Promise<AgentResponse> {
        const startedAt = Date.now();
        const controller = new AbortController();
        this.activeRuns.set(request.runId, controller);

        try {
            const headers: Record<string, string> = {
                'content-type': 'application/json',
            };

            if (this.config.auth?.type === 'bearer') {
                const token = process.env[this.config.auth.token_env];
                if (!token) {
                    throw new AgentExecutionError(
                        `Missing ACP bearer token in env ${this.config.auth.token_env}`,
                        {
                            agent: this.name,
                        },
                    );
                }

                headers.authorization = `Bearer ${token}`;
            }

            const response = await fetch(
                `${this.config.url.replace(/\/$/, '')}/agents/${this.config.agent_id}/run`,
                {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        mode: 'sync',
                        input: {
                            system: request.systemPrompt,
                            messages: [
                                ...request.history,
                                {
                                    role: 'user',
                                    content: request.text,
                                },
                            ],
                        },
                    }),
                    signal: controller.signal,
                },
            );
            const rawText = await response.text();

            if (!response.ok) {
                throw new AgentExecutionError(`ACP agent returned ${response.status}`, {
                    agent: this.name,
                    stderr: rawText,
                    exitCode: response.status,
                });
            }

            return {
                content: extractTextFromStructuredOutput(rawText),
                agent: this.name,
                duration: Date.now() - startedAt,
                rawOutput: rawText,
            };
        } catch (error) {
            if (error instanceof AgentExecutionError) {
                throw error;
            }

            throw new AgentExecutionError(
                error instanceof Error
                    ? `ACP request failed: ${error.message}`
                    : 'ACP request failed',
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
        if (this.config.auth?.type === 'bearer') {
            return Boolean(process.env[this.config.auth.token_env]);
        }

        return Boolean(this.config.url);
    }
}
