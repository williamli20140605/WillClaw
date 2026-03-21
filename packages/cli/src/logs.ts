import { open, stat } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

import {
    getWillClawPaths,
    listToolExecutionLogs,
    loadWillClawConfig,
    type ToolLogEntry,
    type ToolLogFilters,
} from '@willclaw/core';

const DEFAULT_LINES = 20;
const FOLLOW_POLL_MS = 1_000;
const TAIL_CHUNK_BYTES = 64 * 1024;

interface LogsCommandOptions {
    action?: string;
    agent?: string;
    chatId?: string;
    follow: boolean;
    home?: string;
    lines?: string;
    success?: string;
    tool?: boolean;
    toolName?: string;
}

interface ResolvedLogTargets {
    appLogPath: string;
    toolLogDbPath: string;
}

function parseLineCount(input: string | undefined): number {
    const parsed = Number.parseInt(input ?? String(DEFAULT_LINES), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error('`--lines` must be a positive integer.');
    }

    return parsed;
}

function parseSuccessFilter(
    input: string | undefined,
): boolean | undefined {
    if (input === undefined) {
        return undefined;
    }

    const normalized = input.trim().toLowerCase();
    if (['true', '1', 'yes', 'ok', 'success'].includes(normalized)) {
        return true;
    }

    if (['false', '0', 'no', 'err', 'error', 'fail', 'failed'].includes(normalized)) {
        return false;
    }

    throw new Error('`--success` must be true or false.');
}

function shouldUseToolLogs(options: LogsCommandOptions): boolean {
    return Boolean(
        options.tool ||
            options.toolName ||
            options.action ||
            options.agent ||
            options.chatId ||
            options.success !== undefined,
    );
}

function summarizeText(value: string | undefined, maxLength = 160): string {
    if (!value) {
        return '';
    }

    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized) {
        return '';
    }

    if (normalized.length <= maxLength) {
        return normalized;
    }

    return `${normalized.slice(0, maxLength - 1)}...`;
}

function formatToolLogEntry(entry: ToolLogEntry): string {
    const parts = [
        `[${entry.timestamp}]`,
        entry.success ? 'OK' : 'ERR',
        `${entry.tool}.${entry.action}`,
        `agent=${entry.agent}`,
        `duration=${entry.durationMs}ms`,
    ];

    if (entry.chatId) {
        parts.push(`chat=${entry.chatId}`);
    }

    if (entry.exitCode !== undefined) {
        parts.push(`exit=${entry.exitCode}`);
    }

    const lines = [parts.join(' ')];
    const inputSummary = summarizeText(entry.input);
    if (inputSummary) {
        lines.push(`  input: ${inputSummary}`);
    }

    const detailSummary = summarizeText(entry.error ?? entry.output);
    if (detailSummary) {
        lines.push(`  ${entry.error ? 'error' : 'output'}: ${detailSummary}`);
    }

    return lines.join('\n');
}

async function resolveLogTargets(
    homeDir?: string,
): Promise<ResolvedLogTargets> {
    try {
        const { config } = await loadWillClawConfig(
            homeDir ? { homeDir } : undefined,
        );
        return {
            appLogPath: config.logging.app_log,
            toolLogDbPath: config.logging.tool_log_db,
        };
    } catch {
        const paths = getWillClawPaths(homeDir);
        return {
            appLogPath: paths.appLogPath,
            toolLogDbPath: paths.toolLogDbPath,
        };
    }
}

async function readRecentAppLogLines(
    filePath: string,
    lineCount: number,
): Promise<{ lines: string[]; size: number }> {
    try {
        const handle = await open(filePath, 'r');

        try {
            const fileStats = await handle.stat();
            let position = fileStats.size;
            let contents = '';

            while (
                position > 0 &&
                contents.split(/\r?\n/).filter(Boolean).length <= lineCount
            ) {
                const chunkSize = Math.min(TAIL_CHUNK_BYTES, position);
                position -= chunkSize;

                const buffer = Buffer.alloc(chunkSize);
                await handle.read(buffer, 0, chunkSize, position);
                contents = buffer.toString('utf8') + contents;
            }

            return {
                lines: contents.split(/\r?\n/).filter(Boolean).slice(-lineCount),
                size: fileStats.size,
            };
        } finally {
            await handle.close();
        }
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return {
                lines: [],
                size: 0,
            };
        }

        throw error;
    }
}

async function readAppLogDelta(
    filePath: string,
    offset: number,
): Promise<{ chunk: string; nextOffset: number; truncated: boolean }> {
    const fileStats = await stat(filePath);
    const truncated = fileStats.size < offset;
    const startOffset = truncated ? 0 : offset;

    if (fileStats.size <= startOffset) {
        return {
            chunk: '',
            nextOffset: fileStats.size,
            truncated,
        };
    }

    const handle = await open(filePath, 'r');

    try {
        const bytesToRead = fileStats.size - startOffset;
        const buffer = Buffer.alloc(bytesToRead);
        await handle.read(buffer, 0, bytesToRead, startOffset);

        return {
            chunk: buffer.toString('utf8'),
            nextOffset: fileStats.size,
            truncated,
        };
    } finally {
        await handle.close();
    }
}

function printLines(lines: string[]): void {
    for (const line of lines) {
        console.log(line);
    }
}

function buildToolFilters(options: LogsCommandOptions, limit: number): ToolLogFilters {
    const filters: ToolLogFilters = { limit };
    const success = parseSuccessFilter(options.success);

    if (options.action) {
        filters.action = options.action;
    }

    if (options.agent) {
        filters.agent = options.agent;
    }

    if (options.chatId) {
        filters.chatId = options.chatId;
    }

    if (success !== undefined) {
        filters.success = success;
    }

    if (options.toolName) {
        filters.tool = options.toolName;
    }

    return filters;
}

async function streamAppLogs(
    filePath: string,
    lineCount: number,
    follow: boolean,
): Promise<void> {
    const initial = await readRecentAppLogLines(filePath, lineCount);
    if (initial.lines.length === 0) {
        console.log(`No app log yet at ${filePath}`);
    } else {
        printLines(initial.lines);
    }

    if (!follow) {
        return;
    }

    let offset = initial.size;
    let partialLine = '';
    let stopped = false;

    const stop = () => {
        stopped = true;
    };

    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);

    try {
        while (!stopped) {
            await delay(FOLLOW_POLL_MS);

            try {
                const { chunk, nextOffset, truncated } = await readAppLogDelta(
                    filePath,
                    offset,
                );
                if (!chunk) {
                    offset = nextOffset;
                    if (truncated) {
                        partialLine = '';
                    }
                    continue;
                }

                offset = nextOffset;
                const merged = `${truncated ? '' : partialLine}${chunk}`;
                const lines = merged.split(/\r?\n/);
                partialLine = lines.pop() ?? '';
                printLines(lines.filter(Boolean));
            } catch (error) {
                const errno = (error as NodeJS.ErrnoException).code;
                if (errno === 'ENOENT') {
                    continue;
                }

                throw error;
            }
        }
    } finally {
        process.off('SIGINT', stop);
        process.off('SIGTERM', stop);
    }
}

async function streamToolLogs(
    databasePath: string,
    filters: ToolLogFilters,
    follow: boolean,
): Promise<void> {
    const initial = listToolExecutionLogs(databasePath, filters);
    if (initial.length === 0) {
        console.log(`No tool logs yet at ${databasePath}`);
    } else {
        for (const entry of [...initial].reverse()) {
            console.log(formatToolLogEntry(entry));
        }
    }

    if (!follow) {
        return;
    }

    let lastSeenId = initial.reduce(
        (maxId, entry) => Math.max(maxId, entry.id),
        0,
    );
    let stopped = false;

    const stop = () => {
        stopped = true;
    };

    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);

    try {
        while (!stopped) {
            await delay(FOLLOW_POLL_MS);

            const nextBatch = listToolExecutionLogs(databasePath, {
                ...filters,
                limit: Math.max(filters.limit ?? DEFAULT_LINES, 200),
            });
            const unseen = nextBatch
                .filter((entry) => entry.id > lastSeenId)
                .sort((left, right) => left.id - right.id);

            if (unseen.length === 0) {
                continue;
            }

            for (const entry of unseen) {
                console.log(formatToolLogEntry(entry));
                lastSeenId = Math.max(lastSeenId, entry.id);
            }
        }
    } finally {
        process.off('SIGINT', stop);
        process.off('SIGTERM', stop);
    }
}

export async function runLogsCommand(
    options: LogsCommandOptions,
): Promise<void> {
    const lineCount = parseLineCount(options.lines);
    const targets = await resolveLogTargets(options.home);

    if (shouldUseToolLogs(options)) {
        const filters = buildToolFilters(options, lineCount);
        await streamToolLogs(targets.toolLogDbPath, filters, options.follow);
        return;
    }

    await streamAppLogs(targets.appLogPath, lineCount, options.follow);
}
