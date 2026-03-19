import { mkdirSync } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import type { ChatMessage } from './agents/types.js';

type MessageRole = 'user' | 'assistant' | 'system';
type MessageStatus = 'active' | 'revoked';
type CommandRunStatus =
    | 'queued'
    | 'running'
    | 'completed'
    | 'failed'
    | 'cancelled';

export interface StoredMessage extends ChatMessage {
    id: number;
    timestamp: string;
    channel: string;
    chatId: string;
    userId: string;
    agent?: string;
    durationMs?: number;
    exitCode?: number;
    metadata?: Record<string, unknown>;
    status: MessageStatus;
    revokedAt?: string;
    editOf?: number;
    runId?: string;
}

export interface SearchMessageResult {
    id: number;
    timestamp: string;
    channel: string;
    chatId: string;
    role: MessageRole;
    content: string;
    snippet: string;
}

export interface IndexedFileRecord {
    id: number;
    filepath: string;
    fileType: string;
    content: string;
    updatedAt: string;
}

export interface SearchFileResult {
    id: number;
    filepath: string;
    fileType: string;
    content: string;
    snippet: string;
    updatedAt: string;
}

export interface ChatSummary {
    channel: string;
    chatId: string;
    updatedAt: string;
    messageCount: number;
    preview: string;
    role: MessageRole;
    agent?: string;
    runId?: string;
}

export interface SaveMessageInput {
    timestamp?: string;
    channel: string;
    chatId: string;
    userId: string;
    role: MessageRole;
    content: string;
    agent?: string;
    durationMs?: number;
    exitCode?: number;
    metadata?: Record<string, unknown>;
    status?: MessageStatus;
    revokedAt?: string;
    editOf?: number;
    runId?: string;
}

export interface SaveCommandRunInput {
    runId: string;
    timestamp?: string;
    agent: string;
    chatId: string;
    prompt: string;
    status: CommandRunStatus;
    exitCode?: number;
    durationMs?: number;
    stdout?: string;
    stderr?: string;
}

export interface StoredCommandRun {
    id: number;
    runId: string;
    timestamp: string;
    agent: string;
    chatId: string;
    prompt: string;
    status: CommandRunStatus;
    exitCode?: number;
    durationMs?: number;
    stdout?: string;
    stderr?: string;
}

interface MessageRow {
    id: number;
    timestamp: string;
    channel: string;
    chat_id: string;
    user_id: string;
    role: MessageRole;
    content: string;
    agent: string | null;
    duration_ms: number | null;
    exit_code: number | null;
    metadata: string | null;
    status: MessageStatus;
    revoked_at: string | null;
    edit_of: number | null;
    run_id: string | null;
}

interface CommandRunRow {
    id: number;
    run_id: string;
    timestamp: string;
    agent: string;
    chat_id: string;
    prompt: string;
    status: CommandRunStatus;
    exit_code: number | null;
    duration_ms: number | null;
    stdout: string | null;
    stderr: string | null;
}

interface IndexedFileRow {
    id: number;
    filepath: string;
    file_type: string;
    content: string;
    updated_at: string;
}

function parseMetadata(
    value: string | null,
): Record<string, unknown> | undefined {
    if (!value) {
        return undefined;
    }

    try {
        const parsed = JSON.parse(value) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
        }
    } catch {
        return undefined;
    }

    return undefined;
}

function collapseWhitespace(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function hydrateMessage(row: MessageRow): StoredMessage {
    const message: StoredMessage = {
        id: row.id,
        timestamp: row.timestamp,
        channel: row.channel,
        chatId: row.chat_id,
        userId: row.user_id,
        role: row.role,
        content: row.content,
        status: row.status,
    };

    if (row.agent) {
        message.agent = row.agent;
    }

    if (row.duration_ms != null) {
        message.durationMs = row.duration_ms;
    }

    if (row.exit_code != null) {
        message.exitCode = row.exit_code;
    }

    const metadata = parseMetadata(row.metadata);
    if (metadata) {
        message.metadata = metadata;
    }

    if (row.revoked_at) {
        message.revokedAt = row.revoked_at;
    }

    if (row.edit_of != null) {
        message.editOf = row.edit_of;
    }

    if (row.run_id) {
        message.runId = row.run_id;
    }

    return message;
}

function hydrateCommandRun(row: CommandRunRow): StoredCommandRun {
    const run: StoredCommandRun = {
        id: row.id,
        runId: row.run_id,
        timestamp: row.timestamp,
        agent: row.agent,
        chatId: row.chat_id,
        prompt: row.prompt,
        status: row.status,
    };

    if (row.exit_code != null) {
        run.exitCode = row.exit_code;
    }

    if (row.duration_ms != null) {
        run.durationMs = row.duration_ms;
    }

    if (row.stdout) {
        run.stdout = row.stdout;
    }

    if (row.stderr) {
        run.stderr = row.stderr;
    }

    return run;
}

function hydrateIndexedFile(row: IndexedFileRow): IndexedFileRecord {
    return {
        id: row.id,
        filepath: row.filepath,
        fileType: row.file_type,
        content: row.content,
        updatedAt: row.updated_at,
    };
}

export class MemoryStore {
    private readonly db: Database.Database;

    constructor(databasePath: string) {
        mkdirSync(path.dirname(databasePath), { recursive: true });
        this.db = new Database(databasePath);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('busy_timeout = 5000');
        this.initializeSchema();
    }

    saveMessage(input: SaveMessageInput): StoredMessage {
        const timestamp = input.timestamp ?? new Date().toISOString();
        const statement = this.db.prepare(`
      INSERT INTO messages (
        timestamp,
        channel,
        chat_id,
        user_id,
        role,
        content,
        agent,
        duration_ms,
        exit_code,
        metadata,
        status,
        revoked_at,
        edit_of,
        run_id
      ) VALUES (
        @timestamp,
        @channel,
        @chatId,
        @userId,
        @role,
        @content,
        @agent,
        @durationMs,
        @exitCode,
        @metadata,
        @status,
        @revokedAt,
        @editOf,
        @runId
      )
    `);
        const result = statement.run({
            timestamp,
            channel: input.channel,
            chatId: input.chatId,
            userId: input.userId,
            role: input.role,
            content: input.content,
            agent: input.agent ?? null,
            durationMs: input.durationMs ?? null,
            exitCode: input.exitCode ?? null,
            metadata: input.metadata ? JSON.stringify(input.metadata) : null,
            status: input.status ?? 'active',
            revokedAt: input.revokedAt ?? null,
            editOf: input.editOf ?? null,
            runId: input.runId ?? null,
        });

        const message = this.getMessageById(Number(result.lastInsertRowid));
        if (!message) {
            throw new Error(`Message ${String(result.lastInsertRowid)} not found after insert.`);
        }

        return message;
    }

    getMessageById(id: number): StoredMessage | null {
        const statement = this.db.prepare('SELECT * FROM messages WHERE id = ?');
        const row = statement.get(id) as MessageRow | undefined;

        if (!row) {
            return null;
        }

        return hydrateMessage(row);
    }

    listMessages(options?: {
        channel?: string;
        chatId?: string;
        limit?: number;
        includeRevoked?: boolean;
        from?: string;
        to?: string;
        beforeMessageId?: number;
    }): StoredMessage[] {
        const clauses = ['1 = 1'];
        const params: Record<string, unknown> = {
            limit: options?.limit ?? 50,
        };

        if (!options?.includeRevoked) {
            clauses.push("status = 'active'");
        }

        if (options?.channel) {
            clauses.push('channel = @channel');
            params.channel = options.channel;
        }

        if (options?.chatId) {
            clauses.push('chat_id = @chatId');
            params.chatId = options.chatId;
        }

        if (options?.from) {
            clauses.push('timestamp >= @from');
            params.from = options.from;
        }

        if (options?.to) {
            clauses.push('timestamp < @to');
            params.to = options.to;
        }

        if (options?.beforeMessageId != null) {
            clauses.push('id < @beforeMessageId');
            params.beforeMessageId = options.beforeMessageId;
        }

        const statement = this.db.prepare(`
      SELECT *
      FROM messages
      WHERE ${clauses.join(' AND ')}
      ORDER BY timestamp DESC, id DESC
      LIMIT @limit
    `);

        return (statement.all(params) as MessageRow[])
            .map(hydrateMessage)
            .reverse();
    }

    getChatHistory(options: {
        channel: string;
        chatId: string;
        limit: number;
        beforeMessageId?: number;
    }): ChatMessage[] {
        return this.listMessages({
            channel: options.channel,
            chatId: options.chatId,
            limit: options.limit,
            ...(options.beforeMessageId != null
                ? { beforeMessageId: options.beforeMessageId }
                : {}),
        }).map((message) => ({
            role: message.role,
            content: message.content,
        }));
    }

    listChats(options?: {
        channel?: string;
        limit?: number;
        includeRevoked?: boolean;
    }): ChatSummary[] {
        const clauses = ['1 = 1'];
        const params: Record<string, unknown> = {
            limit: options?.limit ?? 24,
        };

        if (!options?.includeRevoked) {
            clauses.push("status = 'active'");
        }

        if (options?.channel) {
            clauses.push('channel = @channel');
            params.channel = options.channel;
        }

        const statement = this.db.prepare(`
      WITH ranked AS (
        SELECT
          channel,
          chat_id,
          timestamp,
          role,
          content,
          agent,
          run_id,
          ROW_NUMBER() OVER (
            PARTITION BY channel, chat_id
            ORDER BY timestamp DESC, id DESC
          ) AS rank_in_chat,
          COUNT(*) OVER (
            PARTITION BY channel, chat_id
          ) AS message_count
        FROM messages
        WHERE ${clauses.join(' AND ')}
      )
      SELECT
        channel,
        chat_id,
        timestamp,
        role,
        content,
        agent,
        run_id,
        message_count
      FROM ranked
      WHERE rank_in_chat = 1
      ORDER BY timestamp DESC
      LIMIT @limit
    `);

        return (
            statement.all(params) as Array<{
                channel: string;
                chat_id: string;
                timestamp: string;
                role: MessageRole;
                content: string;
                agent: string | null;
                run_id: string | null;
                message_count: number;
            }>
        ).map((row) => ({
            channel: row.channel,
            chatId: row.chat_id,
            updatedAt: row.timestamp,
            messageCount: row.message_count,
            preview: collapseWhitespace(row.content),
            role: row.role,
            ...(row.agent ? { agent: row.agent } : {}),
            ...(row.run_id ? { runId: row.run_id } : {}),
        }));
    }

    listMessagesByRunId(
        runId: string,
        options?: { includeRevoked?: boolean },
    ): StoredMessage[] {
        const clauses = ['run_id = @runId'];
        if (!options?.includeRevoked) {
            clauses.push("status = 'active'");
        }

        const statement = this.db.prepare(`
      SELECT *
      FROM messages
      WHERE ${clauses.join(' AND ')}
      ORDER BY timestamp ASC, id ASC
    `);

        return (statement.all({ runId }) as MessageRow[]).map(hydrateMessage);
    }

    searchMessages(
        query: string,
        options?: {
            channel?: string;
            chatId?: string;
            from?: string;
            to?: string;
            excludeRunId?: string;
            limit?: number;
        },
    ): SearchMessageResult[] {
        if (!query.trim()) {
            return [];
        }

        const clauses = ["m.status = 'active'", 'messages_fts MATCH @query'];
        const params: Record<string, unknown> = {
            query,
            limit: options?.limit ?? 20,
        };

        if (options?.channel) {
            clauses.push('m.channel = @channel');
            params.channel = options.channel;
        }

        if (options?.chatId) {
            clauses.push('m.chat_id = @chatId');
            params.chatId = options.chatId;
        }

        if (options?.from) {
            clauses.push('m.timestamp >= @from');
            params.from = options.from;
        }

        if (options?.to) {
            clauses.push('m.timestamp < @to');
            params.to = options.to;
        }

        if (options?.excludeRunId) {
            clauses.push('(m.run_id IS NULL OR m.run_id != @excludeRunId)');
            params.excludeRunId = options.excludeRunId;
        }

        const statement = this.db.prepare(`
      SELECT
        m.id,
        m.timestamp,
        m.channel,
        m.chat_id,
        m.role,
        m.content,
        snippet(messages_fts, 0, '[', ']', '...', 12) AS snippet
      FROM messages_fts
      JOIN messages AS m ON m.id = messages_fts.rowid
      WHERE ${clauses.join(' AND ')}
      ORDER BY bm25(messages_fts), m.timestamp DESC
      LIMIT @limit
    `);

        return (
            statement.all(params) as Array<{
                id: number;
                timestamp: string;
                channel: string;
                chat_id: string;
                role: MessageRole;
                content: string;
                snippet: string;
            }>
        ).map((row) => ({
            id: row.id,
            timestamp: row.timestamp,
            channel: row.channel,
            chatId: row.chat_id,
            role: row.role,
            content: row.content,
            snippet: row.snippet,
        }));
    }

    upsertIndexedFile(input: {
        filepath: string;
        fileType: string;
        content: string;
        updatedAt?: string;
    }): IndexedFileRecord {
        const statement = this.db.prepare(`
      INSERT INTO indexed_files (
        filepath,
        file_type,
        content,
        updated_at
      ) VALUES (
        @filepath,
        @fileType,
        @content,
        @updatedAt
      )
      ON CONFLICT(filepath) DO UPDATE SET
        file_type = excluded.file_type,
        content = excluded.content,
        updated_at = excluded.updated_at
    `);

        statement.run({
            filepath: input.filepath,
            fileType: input.fileType,
            content: input.content,
            updatedAt: input.updatedAt ?? new Date().toISOString(),
        });

        const record = this.getIndexedFile(input.filepath);
        if (!record) {
            throw new Error(`Indexed file ${input.filepath} not found after upsert.`);
        }

        return record;
    }

    getIndexedFile(filepath: string): IndexedFileRecord | null {
        const statement = this.db.prepare(
            'SELECT * FROM indexed_files WHERE filepath = ?',
        );
        const row = statement.get(filepath) as IndexedFileRow | undefined;

        if (!row) {
            return null;
        }

        return hydrateIndexedFile(row);
    }

    listIndexedFiles(options?: {
        fileType?: string;
        limit?: number;
    }): IndexedFileRecord[] {
        const clauses = ['1 = 1'];
        const params: Record<string, unknown> = {
            limit: options?.limit ?? 200,
        };

        if (options?.fileType) {
            clauses.push('file_type = @fileType');
            params.fileType = options.fileType;
        }

        const statement = this.db.prepare(`
      SELECT *
      FROM indexed_files
      WHERE ${clauses.join(' AND ')}
      ORDER BY updated_at DESC, id DESC
      LIMIT @limit
    `);

        return (statement.all(params) as IndexedFileRow[]).map(hydrateIndexedFile);
    }

    searchIndexedFiles(
        query: string,
        options?: {
            fileType?: string;
            filepathLike?: string;
            limit?: number;
        },
    ): SearchFileResult[] {
        if (!query.trim()) {
            return [];
        }

        const clauses = ['files_fts MATCH @query'];
        const params: Record<string, unknown> = {
            query,
            limit: options?.limit ?? 20,
        };

        if (options?.fileType) {
            clauses.push('f.file_type = @fileType');
            params.fileType = options.fileType;
        }

        if (options?.filepathLike) {
            clauses.push('f.filepath LIKE @filepathLike');
            params.filepathLike = options.filepathLike;
        }

        const statement = this.db.prepare(`
      SELECT
        f.id,
        f.filepath,
        f.file_type,
        f.content,
        f.updated_at,
        snippet(files_fts, 0, '[', ']', '...', 12) AS snippet
      FROM files_fts
      JOIN indexed_files AS f ON f.id = files_fts.rowid
      WHERE ${clauses.join(' AND ')}
      ORDER BY bm25(files_fts), f.updated_at DESC
      LIMIT @limit
    `);

        return (
            statement.all(params) as Array<{
                id: number;
                filepath: string;
                file_type: string;
                content: string;
                updated_at: string;
                snippet: string;
            }>
        ).map((row) => ({
            id: row.id,
            filepath: row.filepath,
            fileType: row.file_type,
            content: row.content,
            updatedAt: row.updated_at,
            snippet: row.snippet,
        }));
    }

    saveCommandRun(input: SaveCommandRunInput): void {
        const statement = this.db.prepare(`
      INSERT INTO command_runs (
        run_id,
        timestamp,
        agent,
        chat_id,
        prompt,
        status,
        exit_code,
        duration_ms,
        stdout,
        stderr
      ) VALUES (
        @runId,
        @timestamp,
        @agent,
        @chatId,
        @prompt,
        @status,
        @exitCode,
        @durationMs,
        @stdout,
        @stderr
      )
      ON CONFLICT(run_id) DO UPDATE SET
        timestamp = excluded.timestamp,
        agent = excluded.agent,
        chat_id = excluded.chat_id,
        prompt = excluded.prompt,
        status = excluded.status,
        exit_code = excluded.exit_code,
        duration_ms = excluded.duration_ms,
        stdout = excluded.stdout,
        stderr = excluded.stderr
    `);

        statement.run({
            runId: input.runId,
            timestamp: input.timestamp ?? new Date().toISOString(),
            agent: input.agent,
            chatId: input.chatId,
            prompt: input.prompt,
            status: input.status,
            exitCode: input.exitCode ?? null,
            durationMs: input.durationMs ?? null,
            stdout: input.stdout ?? null,
            stderr: input.stderr ?? null,
        });
    }

    getCommandRun(runId: string): StoredCommandRun | null {
        const statement = this.db.prepare(
            'SELECT * FROM command_runs WHERE run_id = ?',
        );
        const row = statement.get(runId) as CommandRunRow | undefined;

        if (!row) {
            return null;
        }

        return hydrateCommandRun(row);
    }

    revokeMessages(messageIds: number[], revokedAt?: string): StoredMessage[] {
        const uniqueIds = [...new Set(messageIds)].filter((id) => id > 0);
        if (uniqueIds.length === 0) {
            return [];
        }

        const timestamp = revokedAt ?? new Date().toISOString();
        const updateMessage = this.db.prepare(`
      UPDATE messages
      SET status = 'revoked',
          revoked_at = @revokedAt
      WHERE id = @id
        AND status != 'revoked'
    `);
        const transaction = this.db.transaction((ids: number[]) => {
            for (const id of ids) {
                updateMessage.run({
                    id,
                    revokedAt: timestamp,
                });
            }
        });

        transaction(uniqueIds);

        const statement = this.db.prepare(`
      SELECT *
      FROM messages
      WHERE id IN (${uniqueIds.map(() => '?').join(', ')})
      ORDER BY timestamp ASC, id ASC
    `);

        return (statement.all(...uniqueIds) as MessageRow[]).map(hydrateMessage);
    }

    updateCommandRun(runId: string, updates: Partial<SaveCommandRunInput>) {
        const existing = this.getCommandRun(runId);
        if (!existing) {
            return null;
        }

        const input: SaveCommandRunInput = {
            runId: existing.runId,
            timestamp: updates.timestamp ?? existing.timestamp,
            agent: updates.agent ?? existing.agent,
            chatId: updates.chatId ?? existing.chatId,
            prompt: updates.prompt ?? existing.prompt,
            status: updates.status ?? existing.status,
        };
        const exitCode = updates.exitCode ?? existing.exitCode;
        const durationMs = updates.durationMs ?? existing.durationMs;
        const stdout = updates.stdout ?? existing.stdout;
        const stderr = updates.stderr ?? existing.stderr;

        if (exitCode != null) {
            input.exitCode = exitCode;
        }

        if (durationMs != null) {
            input.durationMs = durationMs;
        }

        if (stdout) {
            input.stdout = stdout;
        }

        if (stderr) {
            input.stderr = stderr;
        }

        this.saveCommandRun(input);

        return this.getCommandRun(runId);
    }

    close(): void {
        this.db.close();
    }

    private initializeSchema(): void {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp   TEXT NOT NULL,
        channel     TEXT NOT NULL,
        chat_id     TEXT NOT NULL,
        user_id     TEXT NOT NULL,
        role        TEXT NOT NULL,
        content     TEXT NOT NULL,
        agent       TEXT,
        duration_ms INTEGER,
        exit_code   INTEGER,
        metadata    TEXT,
        status      TEXT NOT NULL DEFAULT 'active',
        revoked_at  TEXT,
        edit_of     INTEGER REFERENCES messages(id),
        run_id      TEXT
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
        content,
        channel,
        role,
        content='messages',
        content_rowid='id',
        tokenize='unicode61'
      );

      CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
        INSERT INTO messages_fts(rowid, content, channel, role)
        SELECT new.id, new.content, new.channel, new.role
        WHERE new.status = 'active';
      END;

      CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
        INSERT INTO messages_fts(messages_fts, rowid, content, channel, role)
        VALUES ('delete', old.id, old.content, old.channel, old.role);

        INSERT INTO messages_fts(rowid, content, channel, role)
        SELECT new.id, new.content, new.channel, new.role
        WHERE new.status = 'active';
      END;

      CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
        INSERT INTO messages_fts(messages_fts, rowid, content, channel, role)
        VALUES ('delete', old.id, old.content, old.channel, old.role);
      END;

      CREATE TABLE IF NOT EXISTS command_runs (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id      TEXT NOT NULL UNIQUE,
        timestamp   TEXT NOT NULL,
        agent       TEXT NOT NULL,
        chat_id     TEXT NOT NULL,
        prompt      TEXT NOT NULL,
        status      TEXT NOT NULL,
        exit_code   INTEGER,
        duration_ms INTEGER,
        stdout      TEXT,
        stderr      TEXT
      );

      CREATE TABLE IF NOT EXISTS indexed_files (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        filepath   TEXT NOT NULL UNIQUE,
        file_type  TEXT NOT NULL,
        content    TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
        content,
        filepath,
        file_type,
        content='indexed_files',
        content_rowid='id',
        tokenize='unicode61'
      );

      CREATE TRIGGER IF NOT EXISTS indexed_files_ai AFTER INSERT ON indexed_files BEGIN
        INSERT INTO files_fts(rowid, content, filepath, file_type)
        VALUES (new.id, new.content, new.filepath, new.file_type);
      END;

      CREATE TRIGGER IF NOT EXISTS indexed_files_au AFTER UPDATE ON indexed_files BEGIN
        INSERT INTO files_fts(files_fts, rowid, content, filepath, file_type)
        VALUES ('delete', old.id, old.content, old.filepath, old.file_type);

        INSERT INTO files_fts(rowid, content, filepath, file_type)
        VALUES (new.id, new.content, new.filepath, new.file_type);
      END;

      CREATE TRIGGER IF NOT EXISTS indexed_files_ad AFTER DELETE ON indexed_files BEGIN
        INSERT INTO files_fts(files_fts, rowid, content, filepath, file_type)
        VALUES ('delete', old.id, old.content, old.filepath, old.file_type);
      END;
    `);
    }
}
