import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import type { Logger } from 'pino';

export type ToolLogSuccess = boolean;

export interface ToolLogEntry {
    id: number;
    timestamp: string;
    tool: string;
    action: string;
    agent: string;
    chatId?: string | undefined;
    input: string;
    output?: string | undefined;
    exitCode?: number | undefined;
    durationMs: number;
    success: ToolLogSuccess;
    error?: string | undefined;
}

export interface ToolLogFilters {
    limit?: number;
    tool?: string;
    action?: string;
    agent?: string;
    chatId?: string;
    from?: string;
    to?: string;
    success?: boolean;
}

export interface ToolLogStatsEntry {
    tool: string;
    action: string;
    totalCount: number;
    successCount: number;
    failureCount: number;
    avgDurationMs: number;
}

export interface LogToolExecutionInput {
    timestamp?: string;
    tool: string;
    action: string;
    agent: string;
    chatId?: string | undefined;
    input: string;
    output?: string | undefined;
    exitCode?: number | undefined;
    durationMs: number;
    success: boolean;
    error?: string | undefined;
}

interface ToolLogRow {
    id: number;
    timestamp: string;
    tool: string;
    action: string;
    agent: string;
    chat_id: string | null;
    input: string;
    output: string | null;
    exit_code: number | null;
    duration_ms: number;
    success: number;
    error: string | null;
}

function hydrateToolLog(row: ToolLogRow): ToolLogEntry {
    const entry: ToolLogEntry = {
        id: row.id,
        timestamp: row.timestamp,
        tool: row.tool,
        action: row.action,
        agent: row.agent,
        input: row.input,
        durationMs: row.duration_ms,
        success: Boolean(row.success),
    };

    if (row.chat_id) {
        entry.chatId = row.chat_id;
    }

    if (row.output) {
        entry.output = row.output;
    }

    if (row.exit_code != null) {
        entry.exitCode = row.exit_code;
    }

    if (row.error) {
        entry.error = row.error;
    }

    return entry;
}

function buildListQuery(filters?: ToolLogFilters): {
    params: Record<string, unknown>;
    sql: string;
} {
    const clauses = ['1 = 1'];
    const params: Record<string, unknown> = {
        limit: filters?.limit ?? 100,
    };

    if (filters?.tool) {
        clauses.push('tool = @tool');
        params.tool = filters.tool;
    }

    if (filters?.action) {
        clauses.push('action = @action');
        params.action = filters.action;
    }

    if (filters?.agent) {
        clauses.push('agent = @agent');
        params.agent = filters.agent;
    }

    if (filters?.chatId) {
        clauses.push('chat_id = @chatId');
        params.chatId = filters.chatId;
    }

    if (filters?.from) {
        clauses.push('timestamp >= @from');
        params.from = filters.from;
    }

    if (filters?.to) {
        clauses.push('timestamp <= @to');
        params.to = filters.to;
    }

    if (filters?.success !== undefined) {
        clauses.push('success = @success');
        params.success = filters.success ? 1 : 0;
    }

    return {
        params,
        sql: `
      SELECT *
      FROM tool_logs
      WHERE ${clauses.join(' AND ')}
      ORDER BY timestamp DESC, id DESC
      LIMIT @limit
    `,
    };
}

function runListQuery(
    db: Database.Database,
    filters?: ToolLogFilters,
): ToolLogEntry[] {
    const { params, sql } = buildListQuery(filters);
    const statement = db.prepare(sql);
    return (statement.all(params) as ToolLogRow[]).map(hydrateToolLog);
}

export function listToolExecutionLogs(
    databasePath: string,
    filters?: ToolLogFilters,
): ToolLogEntry[] {
    if (!existsSync(databasePath)) {
        return [];
    }

    const db = new Database(databasePath, {
        readonly: true,
        fileMustExist: true,
    });

    try {
        db.pragma('busy_timeout = 5000');
        return runListQuery(db, filters);
    } finally {
        db.close();
    }
}

export class ToolExecutionLogger {
    private readonly db: Database.Database;

    constructor(
        databasePath: string,
        private readonly appLogger: Logger,
        private readonly maxOutputChars: number,
    ) {
        mkdirSync(path.dirname(databasePath), { recursive: true });
        this.db = new Database(databasePath);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('busy_timeout = 5000');
        this.initializeSchema();
    }

    log(input: LogToolExecutionInput): ToolLogEntry {
        const timestamp = input.timestamp ?? new Date().toISOString();
        const output = this.truncate(input.output);
        const error = this.truncate(input.error);
        const statement = this.db.prepare(`
      INSERT INTO tool_logs (
        timestamp,
        tool,
        action,
        agent,
        chat_id,
        input,
        output,
        exit_code,
        duration_ms,
        success,
        error
      ) VALUES (
        @timestamp,
        @tool,
        @action,
        @agent,
        @chatId,
        @input,
        @output,
        @exitCode,
        @durationMs,
        @success,
        @error
      )
    `);
        const result = statement.run({
            timestamp,
            tool: input.tool,
            action: input.action,
            agent: input.agent,
            chatId: input.chatId ?? null,
            input: input.input,
            output: output ?? null,
            exitCode: input.exitCode ?? null,
            durationMs: input.durationMs,
            success: input.success ? 1 : 0,
            error: error ?? null,
        });
        const entry = this.getById(Number(result.lastInsertRowid));

        if (!entry) {
            throw new Error('Tool log insert succeeded but row could not be loaded.');
        }

        if (entry.success) {
            this.appLogger.info(
                {
                    tool: entry.tool,
                    action: entry.action,
                    agent: entry.agent,
                    chatId: entry.chatId,
                    input: entry.input,
                    output: entry.output,
                    exitCode: entry.exitCode,
                    durationMs: entry.durationMs,
                    success: entry.success,
                },
                'Tool executed',
            );
        } else {
            this.appLogger.warn(
                {
                    tool: entry.tool,
                    action: entry.action,
                    agent: entry.agent,
                    chatId: entry.chatId,
                    input: entry.input,
                    output: entry.output,
                    exitCode: entry.exitCode,
                    durationMs: entry.durationMs,
                    success: entry.success,
                    error: entry.error,
                },
                'Tool execution failed',
            );
        }

        return entry;
    }

    list(filters?: ToolLogFilters): ToolLogEntry[] {
        return runListQuery(this.db, filters);
    }

    pruneOlderThan(timestamp: string): number {
        const statement = this.db.prepare(
            'DELETE FROM tool_logs WHERE timestamp < ?',
        );
        const result = statement.run(timestamp);
        const deletedCount = Number(result.changes);

        if (deletedCount > 0) {
            this.db.pragma('wal_checkpoint(TRUNCATE)');
            this.db.exec('VACUUM');
        }

        return deletedCount;
    }

    getById(id: number): ToolLogEntry | null {
        const statement = this.db.prepare('SELECT * FROM tool_logs WHERE id = ?');
        const row = statement.get(id) as ToolLogRow | undefined;

        return row ? hydrateToolLog(row) : null;
    }

    getStats(): ToolLogStatsEntry[] {
        const statement = this.db.prepare(`
      SELECT
        tool,
        action,
        COUNT(*) AS total_count,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS success_count,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failure_count,
        AVG(duration_ms) AS avg_duration_ms
      FROM tool_logs
      GROUP BY tool, action
      ORDER BY tool, action
    `);

        return (
            statement.all() as Array<{
                tool: string;
                action: string;
                total_count: number;
                success_count: number;
                failure_count: number;
                avg_duration_ms: number | null;
            }>
        ).map((row) => ({
            tool: row.tool,
            action: row.action,
            totalCount: row.total_count,
            successCount: row.success_count,
            failureCount: row.failure_count,
            avgDurationMs: row.avg_duration_ms ?? 0,
        }));
    }

    close(): void {
        this.db.close();
    }

    private truncate(value: string | undefined): string | undefined {
        if (!value) {
            return undefined;
        }

        if (value.length <= this.maxOutputChars) {
            return value;
        }

        return `${value.slice(0, this.maxOutputChars)}\n...[truncated]`;
    }

    private initializeSchema(): void {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS tool_logs (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp   TEXT NOT NULL,
        tool        TEXT NOT NULL,
        action      TEXT NOT NULL,
        agent       TEXT NOT NULL,
        chat_id     TEXT,
        input       TEXT NOT NULL,
        output      TEXT,
        exit_code   INTEGER,
        duration_ms INTEGER NOT NULL,
        success     INTEGER NOT NULL,
        error       TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_tool_logs_time ON tool_logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_tool_logs_tool ON tool_logs(tool, action);
      CREATE INDEX IF NOT EXISTS idx_tool_logs_agent ON tool_logs(agent);
    `);
    }
}
