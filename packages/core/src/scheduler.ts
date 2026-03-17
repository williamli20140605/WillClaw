import cron, { type ScheduledTask } from 'node-cron';
import type { Logger } from 'pino';

import type { WillClawConfig } from './config.js';
import type { WillClawEventHub } from './events.js';
import type { BackgroundTaskEngine, BackgroundTaskResult } from './heartbeat.js';
import type {
    GeneratedDailyNoteResult,
    MemoryCompactResult,
    WorkspaceMemoryManager,
} from './workspace-memory.js';

export type SchedulerTaskKind = 'heartbeat' | 'cron' | 'maintenance';
export type SchedulerTaskRunResult =
    | BackgroundTaskResult
    | GeneratedDailyNoteResult
    | MemoryCompactResult;

interface RegisteredTask {
    id: string;
    kind: SchedulerTaskKind;
    name: string;
    schedule: string;
    runner: () => Promise<SchedulerTaskRunResult>;
    job: ScheduledTask;
    running: boolean;
    lastRunAt: string | undefined;
    lastResult: 'completed' | 'failed' | 'suppressed' | undefined;
    lastError: string | undefined;
}

export interface SchedulerTaskStatus {
    id: string;
    kind: SchedulerTaskKind;
    name: string;
    schedule: string;
    running: boolean;
    lastRunAt?: string;
    lastResult?: 'completed' | 'failed' | 'suppressed';
    lastError?: string;
}

function isSuppressed(result: SchedulerTaskRunResult): boolean {
    return 'suppressed' in result && result.suppressed === true;
}

export class WillClawScheduler {
    private readonly tasks = new Map<string, RegisteredTask>();
    private started = false;

    constructor(
        private readonly config: WillClawConfig,
        private readonly engine: BackgroundTaskEngine,
        private readonly workspaceMemoryManager: WorkspaceMemoryManager,
        private readonly logger: Logger,
        private readonly eventHub: WillClawEventHub,
    ) { }

    start(): void {
        if (this.started) {
            return;
        }

        this.started = true;

        if (this.config.heartbeat.enabled) {
            this.registerTask({
                id: 'heartbeat',
                kind: 'heartbeat',
                name: 'heartbeat',
                schedule: this.config.heartbeat.interval,
                runner: async () => await this.engine.runHeartbeat(),
            });
        }

        for (const [name, entry] of Object.entries(this.config.cron)) {
            this.registerTask({
                id: `cron:${name}`,
                kind: 'cron',
                name,
                schedule: entry.schedule,
                runner: async () => await this.engine.runCronTask(name),
            });
        }

        if (this.config.memory.daily_note.enabled) {
            this.registerTask({
                id: 'maintenance:daily_note',
                kind: 'maintenance',
                name: 'daily_note',
                schedule: this.config.memory.daily_note.schedule,
                runner: async () => await this.workspaceMemoryManager.runScheduledDailyNote(),
            });
        }

        if (this.config.memory.compact.enabled) {
            this.registerTask({
                id: 'maintenance:compact',
                kind: 'maintenance',
                name: 'compact',
                schedule: this.config.memory.compact.schedule,
                runner: async () => await this.workspaceMemoryManager.runScheduledMemoryCompact(),
            });
        }
    }

    stop(): void {
        for (const task of this.tasks.values()) {
            task.job.stop();
            task.job.destroy();
        }

        this.tasks.clear();
        this.started = false;
    }

    listTasks(): SchedulerTaskStatus[] {
        return [...this.tasks.values()].map((task) => {
            const status: SchedulerTaskStatus = {
                id: task.id,
                kind: task.kind,
                name: task.name,
                schedule: task.schedule,
                running: task.running,
            };

            if (task.lastRunAt) {
                status.lastRunAt = task.lastRunAt;
            }

            if (task.lastResult) {
                status.lastResult = task.lastResult;
            }

            if (task.lastError) {
                status.lastError = task.lastError;
            }

            return status;
        });
    }

    async runHeartbeatNow(): Promise<SchedulerTaskRunResult> {
        return await this.runTask('heartbeat');
    }

    async runCronNow(name: string): Promise<SchedulerTaskRunResult> {
        return await this.runTask(`cron:${name}`);
    }

    async runMaintenanceNow(name: 'daily_note' | 'compact'): Promise<SchedulerTaskRunResult> {
        return await this.runTask(`maintenance:${name}`);
    }

    private registerTask(input: {
        id: string;
        kind: SchedulerTaskKind;
        name: string;
        schedule: string;
        runner: () => Promise<SchedulerTaskRunResult>;
    }): void {
        if (!cron.validate(input.schedule)) {
            this.logger.error(
                {
                    taskId: input.id,
                    schedule: input.schedule,
                },
                'Skipping invalid cron schedule',
            );
            return;
        }

        const task: RegisteredTask = {
            id: input.id,
            kind: input.kind,
            name: input.name,
            schedule: input.schedule,
            runner: input.runner,
            running: false,
            lastRunAt: undefined,
            lastResult: undefined,
            lastError: undefined,
            job: cron.schedule(input.schedule, () => {
                void this.runTask(input.id);
            }),
        };

        this.tasks.set(input.id, task);
    }

    private async runTask(id: string): Promise<SchedulerTaskRunResult> {
        const task = this.tasks.get(id);
        if (!task) {
            return await this.runDetachedTask(id);
        }

        if (task.running) {
            throw new Error(`Scheduled task ${task.name} is already running.`);
        }

        task.running = true;
        task.lastRunAt = new Date().toISOString();
        task.lastError = undefined;
        this.eventHub.publish('scheduler.task.started', {
            id: task.id,
            kind: task.kind,
            name: task.name,
            schedule: task.schedule,
        });

        try {
            const result = await task.runner();
            task.lastResult = isSuppressed(result) ? 'suppressed' : 'completed';
            this.eventHub.publish('scheduler.task.completed', {
                id: task.id,
                kind: task.kind,
                name: task.name,
                schedule: task.schedule,
                result: task.lastResult,
            });
            return result;
        } catch (error) {
            task.lastResult = 'failed';
            task.lastError =
                error instanceof Error ? error.message : 'Unknown scheduled task error';
            this.eventHub.publish('scheduler.task.failed', {
                id: task.id,
                kind: task.kind,
                name: task.name,
                schedule: task.schedule,
                error: task.lastError,
            });
            throw error;
        } finally {
            task.running = false;
        }
    }

    private async runDetachedTask(id: string): Promise<SchedulerTaskRunResult> {
        if (id === 'heartbeat') {
            return await this.engine.runHeartbeat();
        }

        if (id.startsWith('cron:')) {
            const name = id.replace(/^cron:/, '');
            if (!this.config.cron[name]) {
                throw new Error(`Unknown scheduled task: ${id}`);
            }

            return await this.engine.runCronTask(name);
        }

        if (id === 'maintenance:daily_note') {
            return await this.workspaceMemoryManager.runScheduledDailyNote();
        }

        if (id === 'maintenance:compact') {
            return await this.workspaceMemoryManager.runScheduledMemoryCompact();
        }

        throw new Error(`Unknown scheduled task: ${id}`);
    }
}
