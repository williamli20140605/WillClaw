import { access, appendFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { StoredMessage } from './memory.js';
import type { FileSystemTool } from './tools/filesystem.js';

function formatDateKey(timestamp: string): string {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

function formatTimeKey(timestamp: string): string {
    const date = new Date(timestamp);
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');

    return `${hour}:${minute}`;
}

function buildTitle(message: StoredMessage): string {
    const time = formatTimeKey(message.timestamp);

    if (message.role === 'user') {
        return `## ${time} — User`;
    }

    if (message.role === 'assistant') {
        const parts = [`## ${time} — WillClaw`];

        if (message.agent) {
            parts.push(`[${message.agent}]`);
        }

        if (message.durationMs != null) {
            const duration = (message.durationMs / 1000).toFixed(1);
            parts.push(
                `(${duration}s${message.exitCode != null ? `, exit=${message.exitCode}` : ''})`,
            );
        }

        return parts.join(' ');
    }

    const subtype =
        message.metadata &&
            typeof message.metadata.subtype === 'string' &&
            message.metadata.subtype
            ? ` (${message.metadata.subtype})`
            : '';

    return `## ${time} — System${subtype}`;
}

export class HistoryExporter {
    constructor(
        private readonly baseDir: string,
        private readonly fileSystemTool?: FileSystemTool,
    ) { }

    async appendMessage(message: StoredMessage): Promise<void> {
        const dateKey = formatDateKey(message.timestamp);
        const channelDir = path.join(this.baseDir, message.channel);
        const filePath = path.join(channelDir, `${dateKey}_${message.chatId}.md`);

        if (this.fileSystemTool) {
            await this.fileSystemTool.mkdir(channelDir, {
                triggeredBy: 'system',
                chatId: message.chatId,
            });
        } else {
            await mkdir(channelDir, { recursive: true });
        }
        await this.ensureHeader(filePath, dateKey, message.channel, message.chatId);

        const block = `${buildTitle(message)}\n\n${message.content.trim() || '(empty)'}\n\n---\n\n`;
        if (this.fileSystemTool) {
            await this.fileSystemTool.appendText(filePath, block, {
                triggeredBy: 'system',
                chatId: message.chatId,
            });
            return;
        }

        await appendFile(filePath, block, 'utf8');
    }

    private async ensureHeader(
        filePath: string,
        dateKey: string,
        channel: string,
        chatId: string,
    ): Promise<void> {
        try {
            await access(filePath);
        } catch {
            const content = `# ${dateKey} | ${channel} | ${chatId}\n\n---\n\n`;

            if (this.fileSystemTool) {
                await this.fileSystemTool.writeText(filePath, content, {
                    triggeredBy: 'system',
                    chatId,
                });
                return;
            }

            await writeFile(filePath, content, 'utf8');
        }
    }
}
