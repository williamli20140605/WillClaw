import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import process from 'node:process';

import type { CliAgentPoolEntry } from '../config.js';

import { AgentExecutionError } from './errors.js';
import { renderExecutionPrompt } from './prompt-renderer.js';
import { extractTextFromStructuredOutput } from './structured-output.js';
import type { AgentBackend, AgentRequest, AgentResponse } from './types.js';

export class CliAgentBackend implements AgentBackend {
    readonly type = 'cli' as const;
    private readonly activeRuns = new Map<
        string,
        ChildProcessWithoutNullStreams
    >();

    constructor(
        readonly name: string,
        private readonly config: CliAgentPoolEntry,
        private readonly promptTransport: 'stdin' | 'argv',
    ) { }

    async execute(request: AgentRequest): Promise<AgentResponse> {
        const startedAt = Date.now();
        const prompt = renderExecutionPrompt(request);
        const args =
            this.promptTransport === 'argv'
                ? [...this.config.args, prompt]
                : [...this.config.args];

        return await new Promise<AgentResponse>((resolve, reject) => {
            const child = spawn(this.config.command, args, {
                cwd: request.workingDirectory ?? process.cwd(),
                env: process.env,
                stdio: 'pipe',
            });

            this.activeRuns.set(request.runId, child);
            let stdout = '';
            let stderr = '';
            let settled = false;
            const timeout = setTimeout(() => {
                child.kill('SIGTERM');
            }, this.config.timeout * 1000);

            child.stdout.setEncoding('utf8');
            child.stderr.setEncoding('utf8');
            child.stdout.on('data', (chunk: string) => {
                stdout += chunk;
            });
            child.stderr.on('data', (chunk: string) => {
                stderr += chunk;
            });

            child.on('error', (error) => {
                if (settled) {
                    return;
                }

                settled = true;
                clearTimeout(timeout);
                this.activeRuns.delete(request.runId);
                reject(
                    new AgentExecutionError(
                        `Failed to launch ${this.name}: ${error.message}`,
                        {
                            agent: this.name,
                            stdout,
                            stderr,
                            cause: error,
                        },
                    ),
                );
            });

            child.on('close', (code, signal) => {
                if (settled) {
                    return;
                }

                settled = true;
                clearTimeout(timeout);
                this.activeRuns.delete(request.runId);
                const duration = Date.now() - startedAt;
                const content =
                    this.config.output_format === 'json'
                        ? extractTextFromStructuredOutput(stdout)
                        : stdout.trim();

                if (code === 0) {
                    const response: AgentResponse = {
                        content,
                        agent: this.name,
                        duration,
                        exitCode: code ?? 0,
                        rawOutput: stdout,
                    };

                    if (signal) {
                        response.metadata = { signal };
                    }

                    resolve({
                        ...response,
                    });
                    return;
                }

                const errorOptions: ConstructorParameters<
                    typeof AgentExecutionError
                >[1] = {
                    agent: this.name,
                    stdout,
                };

                if (code != null) {
                    errorOptions.exitCode = code;
                }

                if (stderr || signal) {
                    errorOptions.stderr = stderr || `terminated by ${signal}`;
                }

                reject(
                    new AgentExecutionError(
                        `${this.name} exited with code ${code ?? 'unknown'}`,
                        errorOptions,
                    ),
                );
            });

            if (this.promptTransport === 'stdin') {
                child.stdin.write(prompt);
            }
            child.stdin.end();
        });
    }

    async cancel(runId: string): Promise<void> {
        const child = this.activeRuns.get(runId);
        if (!child) {
            return;
        }

        child.kill('SIGTERM');
        this.activeRuns.delete(runId);
    }

    async isAvailable(): Promise<boolean> {
        return await new Promise<boolean>((resolve) => {
            const child = spawn('which', [this.config.command], {
                stdio: 'ignore',
            });

            child.on('error', () => resolve(false));
            child.on('close', (code) => resolve(code === 0));
        });
    }
}
