import { once } from 'node:events';
import { createReadStream, createWriteStream } from 'node:fs';
import {
    readdir,
    stat,
    unlink,
} from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { pipeline } from 'node:stream/promises';

import type { Logger } from 'pino';

import type { WillClawConfig } from './config.js';
import { displayPath, type WillClawPaths } from './paths.js';
import type { ToolExecutionLogger } from './tool-logger.js';

export const DEFAULT_LOG_RETENTION_SCHEDULE = '25 3 * * *';

export interface LogRetentionResult {
    retainDays: number;
    cutoffTimestamp: string;
    appLogPath: string;
    appLogLinesKept: number;
    appLogLinesRemoved: number;
    appLogMalformedLines: number;
    toolLogDbPath: string;
    toolLogEntriesRemoved: number;
    deletedFiles: string[];
    content: string;
}

interface AppLogCompactionResult {
    malformedLines: number;
    removedLines: number;
    retainedLines: number;
}

interface AppLogDestination {
    flushSync?(): void;
    reopen(): void;
}

function createCutoffTimestamp(retainDays: number): string {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - retainDays);
    return cutoff.toISOString();
}

function buildTempLogPath(filePath: string): string {
    return path.join(
        path.dirname(filePath),
        `.willclaw-log-retention-${process.pid}-${Date.now()}.tmp`,
    );
}

function shouldKeepAppLogLine(
    line: string,
    cutoffTimestamp: string,
): { keep: boolean; malformed: boolean } {
    if (!line.trim()) {
        return {
            keep: false,
            malformed: false,
        };
    }

    try {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        const timestamp =
            typeof parsed.time === 'string'
                ? parsed.time
                : typeof parsed.timestamp === 'string'
                    ? parsed.timestamp
                    : undefined;

        if (!timestamp) {
            return {
                keep: true,
                malformed: true,
            };
        }

        return {
            keep: timestamp >= cutoffTimestamp,
            malformed: false,
        };
    } catch {
        return {
            keep: true,
            malformed: true,
        };
    }
}

async function writeChunk(
    writer: NodeJS.WritableStream,
    chunk: string,
): Promise<void> {
    if (writer.write(chunk)) {
        return;
    }

    await once(writer, 'drain');
}

async function closeWriter(writer: NodeJS.WritableStream): Promise<void> {
    writer.end();
    await once(writer, 'close');
}

export class LogMaintenanceManager {
    constructor(
        private readonly config: WillClawConfig,
        private readonly paths: WillClawPaths,
        private readonly logger: Logger,
        private readonly appLogDestination: AppLogDestination,
        private readonly toolLogger: ToolExecutionLogger,
    ) { }

    async runRetention(): Promise<LogRetentionResult> {
        const cutoffTimestamp = createCutoffTimestamp(
            this.config.logging.retain_days,
        );
        const appLogResult = await this.compactAppLog(cutoffTimestamp);
        const toolLogEntriesRemoved =
            this.toolLogger.pruneOlderThan(cutoffTimestamp);
        const deletedFiles = await this.deleteStaleLogFiles(cutoffTimestamp);

        const result: LogRetentionResult = {
            retainDays: this.config.logging.retain_days,
            cutoffTimestamp,
            appLogPath: this.config.logging.app_log,
            appLogLinesKept: appLogResult.retainedLines,
            appLogLinesRemoved: appLogResult.removedLines,
            appLogMalformedLines: appLogResult.malformedLines,
            toolLogDbPath: this.config.logging.tool_log_db,
            toolLogEntriesRemoved,
            deletedFiles,
            content: '',
        };
        result.content = this.renderResult(result);

        this.logger.info(
            {
                retainDays: result.retainDays,
                cutoffTimestamp: result.cutoffTimestamp,
                appLogLinesKept: result.appLogLinesKept,
                appLogLinesRemoved: result.appLogLinesRemoved,
                appLogMalformedLines: result.appLogMalformedLines,
                toolLogEntriesRemoved: result.toolLogEntriesRemoved,
                deletedFiles: result.deletedFiles,
            },
            'Log retention maintenance completed',
        );

        return result;
    }

    private async compactAppLog(
        cutoffTimestamp: string,
    ): Promise<AppLogCompactionResult> {
        const filePath = this.config.logging.app_log;
        const tempPath = buildTempLogPath(filePath);
        const initialStats = await this.safeStat(filePath);

        if (!initialStats || initialStats.size === 0) {
            return {
                malformedLines: 0,
                removedLines: 0,
                retainedLines: 0,
            };
        }

        if (typeof this.appLogDestination.flushSync === 'function') {
            this.appLogDestination.flushSync();
        }

        const snapshotSize = initialStats.size;
        const tempWriter = createWriteStream(tempPath, {
            encoding: 'utf8',
        });
        let retainedLines = 0;
        let removedLines = 0;
        let malformedLines = 0;

        try {
            const lineReader = createInterface({
                input: createReadStream(filePath, {
                    encoding: 'utf8',
                    end: snapshotSize - 1,
                }),
                crlfDelay: Infinity,
            });

            try {
                for await (const line of lineReader) {
                    const evaluation = shouldKeepAppLogLine(
                        line,
                        cutoffTimestamp,
                    );

                    if (evaluation.malformed) {
                        malformedLines += 1;
                    }

                    if (!evaluation.keep) {
                        removedLines += 1;
                        continue;
                    }

                    if (!line.trim()) {
                        continue;
                    }

                    retainedLines += 1;
                    await writeChunk(tempWriter, `${line}\n`);
                }
            } finally {
                lineReader.close();
            }

            await closeWriter(tempWriter);

            if (typeof this.appLogDestination.flushSync === 'function') {
                this.appLogDestination.flushSync();
            }

            const latestStats = await this.safeStat(filePath);
            if (latestStats && latestStats.size > snapshotSize) {
                await pipeline(
                    createReadStream(filePath, { start: snapshotSize }),
                    createWriteStream(tempPath, { flags: 'a' }),
                );
            }

            await pipeline(
                createReadStream(tempPath),
                createWriteStream(filePath, { flags: 'w' }),
            );
            this.appLogDestination.reopen();

            return {
                malformedLines,
                removedLines,
                retainedLines,
            };
        } finally {
            tempWriter.destroy();
            await unlink(tempPath).catch(() => undefined);
        }
    }

    private async deleteStaleLogFiles(
        cutoffTimestamp: string,
    ): Promise<string[]> {
        const deletedFiles: string[] = [];
        const cutoffTime = Date.parse(cutoffTimestamp);
        const entries = await readdir(this.paths.logsDir, { withFileTypes: true });

        for (const entry of entries) {
            if (!entry.isFile()) {
                continue;
            }

            const filePath = path.join(this.paths.logsDir, entry.name);
            if (this.isProtectedLogFile(filePath)) {
                continue;
            }

            const fileStats = await this.safeStat(filePath);
            if (!fileStats) {
                continue;
            }

            if (fileStats.mtimeMs >= cutoffTime) {
                continue;
            }

            try {
                await unlink(filePath);
                deletedFiles.push(filePath);
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                    continue;
                }

                throw error;
            }
        }

        return deletedFiles.sort();
    }

    private isProtectedLogFile(filePath: string): boolean {
        return (
            filePath === this.config.logging.app_log ||
            filePath === this.config.logging.tool_log_db ||
            filePath === `${this.config.logging.tool_log_db}-shm` ||
            filePath === `${this.config.logging.tool_log_db}-wal`
        );
    }

    private renderResult(result: LogRetentionResult): string {
        const lines = [
            `Retained the last ${result.retainDays} day(s) of logs.`,
            `Cutoff: ${result.cutoffTimestamp}`,
            '',
            `App log: removed ${result.appLogLinesRemoved} line(s), kept ${result.appLogLinesKept} in ${displayPath(result.appLogPath)}`,
            `Tool log db: removed ${result.toolLogEntriesRemoved} row(s) from ${displayPath(result.toolLogDbPath)}`,
        ];

        if (result.appLogMalformedLines > 0) {
            lines.push(
                `Malformed app log lines kept: ${result.appLogMalformedLines}`,
            );
        }

        if (result.deletedFiles.length > 0) {
            lines.push('');
            lines.push('Deleted stale log files:');
            for (const filePath of result.deletedFiles) {
                lines.push(`- ${displayPath(filePath)}`);
            }
        }

        return lines.join('\n');
    }

    private async safeStat(filePath: string) {
        try {
            return await stat(filePath);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return null;
            }

            throw error;
        }
    }
}
