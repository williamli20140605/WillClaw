export class AgentExecutionError extends Error {
  constructor(
    message: string,
    readonly options: {
      agent: string;
      exitCode?: number;
      stdout?: string;
      stderr?: string;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = 'AgentExecutionError';
  }
}
