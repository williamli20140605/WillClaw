import {
    appendFile as appendNodeFile,
    copyFile,
    mkdir as mkdirNode,
    readFile,
    writeFile,
} from 'node:fs/promises';

import type { ToolExecutionLogger } from '../tool-logger.js';

export interface FileSystemToolContext {
    triggeredBy: string;
    chatId?: string;
}

export class FileSystemTool {
    constructor(private readonly toolLogger: ToolExecutionLogger) { }

    async readText(
        filePath: string,
        context: FileSystemToolContext,
    ): Promise<string> {
        const startedAt = Date.now();

        try {
            const content = await readFile(filePath, 'utf8');
            this.toolLogger.log({
                tool: 'filesystem',
                action: 'read',
                agent: context.triggeredBy,
                chatId: context.chatId,
                input: filePath,
                output: content,
                durationMs: Date.now() - startedAt,
                success: true,
            });

            return content;
        } catch (error) {
            this.toolLogger.log({
                tool: 'filesystem',
                action: 'read',
                agent: context.triggeredBy,
                chatId: context.chatId,
                input: filePath,
                durationMs: Date.now() - startedAt,
                success: false,
                error:
                    error instanceof Error
                        ? error.message
                        : 'Unknown filesystem read error',
            });
            throw error;
        }
    }

    async writeText(
        filePath: string,
        content: string,
        context: FileSystemToolContext,
    ): Promise<void> {
        const startedAt = Date.now();

        try {
            await writeFile(filePath, content, 'utf8');
            this.toolLogger.log({
                tool: 'filesystem',
                action: 'write',
                agent: context.triggeredBy,
                chatId: context.chatId,
                input: filePath,
                output: `bytes=${Buffer.byteLength(content, 'utf8')}`,
                durationMs: Date.now() - startedAt,
                success: true,
            });
        } catch (error) {
            this.toolLogger.log({
                tool: 'filesystem',
                action: 'write',
                agent: context.triggeredBy,
                chatId: context.chatId,
                input: filePath,
                durationMs: Date.now() - startedAt,
                success: false,
                error:
                    error instanceof Error
                        ? error.message
                        : 'Unknown filesystem write error',
            });
            throw error;
        }
    }

    async appendText(
        filePath: string,
        content: string,
        context: FileSystemToolContext,
    ): Promise<void> {
        const startedAt = Date.now();

        try {
            await appendNodeFile(filePath, content, 'utf8');
            this.toolLogger.log({
                tool: 'filesystem',
                action: 'write',
                agent: context.triggeredBy,
                chatId: context.chatId,
                input: filePath,
                output: `bytes=${Buffer.byteLength(content, 'utf8')}`,
                durationMs: Date.now() - startedAt,
                success: true,
            });
        } catch (error) {
            this.toolLogger.log({
                tool: 'filesystem',
                action: 'write',
                agent: context.triggeredBy,
                chatId: context.chatId,
                input: filePath,
                durationMs: Date.now() - startedAt,
                success: false,
                error:
                    error instanceof Error
                        ? error.message
                        : 'Unknown filesystem append error',
            });
            throw error;
        }
    }

    async mkdir(dirPath: string, context: FileSystemToolContext): Promise<void> {
        const startedAt = Date.now();

        try {
            await mkdirNode(dirPath, { recursive: true });
            this.toolLogger.log({
                tool: 'filesystem',
                action: 'mkdir',
                agent: context.triggeredBy,
                chatId: context.chatId,
                input: dirPath,
                durationMs: Date.now() - startedAt,
                success: true,
            });
        } catch (error) {
            this.toolLogger.log({
                tool: 'filesystem',
                action: 'mkdir',
                agent: context.triggeredBy,
                chatId: context.chatId,
                input: dirPath,
                durationMs: Date.now() - startedAt,
                success: false,
                error:
                    error instanceof Error
                        ? error.message
                        : 'Unknown filesystem mkdir error',
            });
            throw error;
        }
    }

    async copy(
        sourcePath: string,
        targetPath: string,
        context: FileSystemToolContext,
    ): Promise<void> {
        const startedAt = Date.now();

        try {
            await copyFile(sourcePath, targetPath);
            this.toolLogger.log({
                tool: 'filesystem',
                action: 'copy',
                agent: context.triggeredBy,
                chatId: context.chatId,
                input: `${sourcePath} -> ${targetPath}`,
                durationMs: Date.now() - startedAt,
                success: true,
            });
        } catch (error) {
            this.toolLogger.log({
                tool: 'filesystem',
                action: 'copy',
                agent: context.triggeredBy,
                chatId: context.chatId,
                input: `${sourcePath} -> ${targetPath}`,
                durationMs: Date.now() - startedAt,
                success: false,
                error:
                    error instanceof Error
                        ? error.message
                        : 'Unknown filesystem copy error',
            });
            throw error;
        }
    }
}
