import cron, { type ScheduledTask } from 'node-cron';
import type { Logger } from 'pino';

import type { WillClawConfig } from './config.js';
import type {
    BackgroundTaskEngine,
    BackgroundTaskKind,
    BackgroundTaskResult,
} from './heartbeat.js';

interface RegisteredTask {
    id: string;
    kind: BackgroundTaskKind;
    name: string;
    schedule: string;
    job: ScheduledTask;
    running: boolean;
    lastRunAt: string | undefined;
    lastResult: 'completed' | 'failed' | 'suppressed' | undefined;
    lastError: string | undefined;
}

export interface SchedulerTaskStatus {
    id: string;
    kind: BackgroundTaskKind;
    name: string;
    schedule: string;
    running: boolean;
    lastRunAt?: string;
    lastResult?: 'completed' | 'failed' | 'suppressed';
    lastError?: string;
}

export class WillClawScheduler {
    private readonly tasks = new Map<string, RegisteredTask>();
    private started = false;

    constructor(
        private readonly config: WillClawConfig,
        private readonly engine: BackgroundTaskEngine,
        private readonly logger: Logger,
    ) { }

    start(): void {
        if (this.started) {
            return;
        }

        this.started = true;

        if (this.config.heartbeat.enabled) {
            this.registerTask('heartbeat', 'heartbeat', this.config.heartbeat.interval);
        }

        for (const [name, entry] of Object.entries(this.config.cron)) {
            this.registerTask(`cron:${name}`, name, entry.schedule);
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

    async runHeartbeatNow(): Promise<BackgroundTaskResult> {
        return await this.runTask('heartbeat');
    }

    async runCronNow(name: string): Promise<BackgroundTaskResult> {
        return await this.runTask(`cron:${name}`);
    }

    private registerTask(
        id: string,
        name: string,
        schedule: string,
    ): void {
        if (!cron.validate(schedule)) {
            this.logger.error(
                {
                    taskId: id,
                    schedule,
                },
                'Skipping invalid cron schedule',
            );
            return;
        }

        const kind: BackgroundTaskKind = id === 'heartbeat' ? 'heartbeat' : 'cron';
        const task: RegisteredTask = {
            id,
            kind,
            name,
            schedule,
            running: false,
            lastRunAt: undefined,
            lastResult: undefined,
            lastError: undefined,
            job: cron.schedule(schedule, () => {
                void this.runTask(id);
            }),
        };

        this.tasks.set(id, task);
    }

    private async runTask(id: string): Promise<BackgroundTaskResult> {
        const task = this.tasks.get(id);
        if (!task) {
            if (id === 'heartbeat') {
                return await this.runDetachedHeartbeat();
            }

            const name = id.replace(/^cron:/, '');
            if (this.config.cron[name]) {
                return await this.runDetachedCron(name);
            }

            throw new Error(`Unknown scheduled task: ${id}`);
        }

        if (task.running) {
            throw new Error(`Scheduled task ${task.name} is already running.`);
        }

        task.running = true;
        task.lastRunAt = new Date().toISOString();
        task.lastError = undefined;

        try {
            const result =
                task.kind === 'heartbeat'
                    ? await this.engine.runHeartbeat()
                    : await this.engine.runCronTask(task.name);
            task.lastResult = result.suppressed ? 'suppressed' : 'completed';
            return result;
        } catch (error) {
            task.lastResult = 'failed';
            task.lastError =
                error instanceof Error ? error.message : 'Unknown scheduled task error';
            throw error;
        } finally {
            task.running = false;
        }
    }

    private async runDetachedHeartbeat(): Promise<BackgroundTaskResult> {
        return await this.engine.runHeartbeat();
    }

    private async runDetachedCron(name: string): Promise<BackgroundTaskResult> {
        return await this.engine.runCronTask(name);
    }
}
