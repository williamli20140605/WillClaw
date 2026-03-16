import { mkdirSync } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import type { ChatMessage } from './agents/types.js';

type MessageRole = 'user' | 'assistant' | 'system';
type MessageStatus = 'active' | 'revoked';
type CommandRunStatus = 'completed' | 'failed' | 'cancelled';

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

    return this.getMessageById(Number(result.lastInsertRowid));
  }

  listMessages(options?: {
    channel?: string;
    chatId?: string;
    limit?: number;
    includeRevoked?: boolean;
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
  }): ChatMessage[] {
    return this.listMessages({
      channel: options.channel,
      chatId: options.chatId,
      limit: options.limit,
    }).map((message) => ({
      role: message.role,
      content: message.content,
    }));
  }

  searchMessages(
    query: string,
    options?: {
      channel?: string;
      chatId?: string;
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

  close(): void {
    this.db.close();
  }

  private getMessageById(id: number): StoredMessage {
    const statement = this.db.prepare('SELECT * FROM messages WHERE id = ?');
    const row = statement.get(id) as MessageRow | undefined;

    if (!row) {
      throw new Error(`Message ${id} not found after insert.`);
    }

    return hydrateMessage(row);
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
    `);
  }
}
