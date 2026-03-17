import { execFile } from 'node:child_process';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { loadWillClawConfig } from '@willclaw/core';

const LAUNCH_AGENTS_DIR = path.join(os.homedir(), 'Library', 'LaunchAgents');

export interface LaunchAgentDefinition {
    label: string;
    plistPath: string;
    stdoutPath: string;
    stderrPath: string;
    plist: string;
}

export interface LaunchAgentStatus {
    label: string;
    plistPath: string;
    installed: boolean;
    loaded: boolean;
    detail?: string;
}

function xmlEscape(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
}

function renderStringArray(values: string[]): string {
    return values
        .map((value) => `    <string>${xmlEscape(value)}</string>`)
        .join('\n');
}

function renderEnvironmentVariables(
    values: Record<string, string>,
): string | null {
    const entries = Object.entries(values).filter(
        ([, value]) => value.length > 0,
    );
    if (entries.length === 0) {
        return null;
    }

    return [
        '  <key>EnvironmentVariables</key>',
        '  <dict>',
        ...entries.flatMap(([key, value]) => [
            `    <key>${xmlEscape(key)}</key>`,
            `    <string>${xmlEscape(value)}</string>`,
        ]),
        '  </dict>',
    ].join('\n');
}

async function pathExists(targetPath: string): Promise<boolean> {
    try {
        await access(targetPath);
        return true;
    } catch {
        return false;
    }
}

async function parseEnvFile(filePath: string): Promise<Record<string, string>> {
    if (!(await pathExists(filePath))) {
        return {};
    }

    const content = await readFile(filePath, 'utf8');
    const values: Record<string, string> = {};

    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) {
            continue;
        }

        const separatorIndex = line.indexOf('=');
        if (separatorIndex < 1) {
            continue;
        }

        const key = line.slice(0, separatorIndex).trim();
        let value = line.slice(separatorIndex + 1).trim();

        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        values[key] = value;
    }

    return values;
}

function createHomeDirOptions(homeDir?: string): { homeDir?: string } {
    if (!homeDir) {
        return {};
    }

    return { homeDir };
}

function getUserDomain(): string {
    if (typeof process.getuid !== 'function') {
        throw new Error('launch-agent commands require macOS user sessions');
    }

    return `gui/${process.getuid()}`;
}

function runLaunchctl(args: string[]): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
}> {
    return new Promise((resolve, reject) => {
        execFile('launchctl', args, (error, stdout, stderr) => {
            if (error) {
                const exitCode = typeof error.code === 'number' ? error.code : 1;
                reject(
                    new Error(stderr || stdout || `launchctl exited with ${exitCode}`),
                );
                return;
            }

            resolve({
                stdout,
                stderr,
                exitCode: 0,
            });
        });
    });
}

export async function buildLaunchAgentDefinition(options: {
    homeDir?: string;
    entryScriptPath: string;
}): Promise<LaunchAgentDefinition> {
    const { config, paths } = await loadWillClawConfig(
        createHomeDirOptions(options.homeDir),
    );
    const label = config.daemon.plist_label;
    const plistPath = path.join(LAUNCH_AGENTS_DIR, `${label}.plist`);
    const stdoutPath = path.join(paths.logsDir, 'launch-agent.stdout.log');
    const stderrPath = path.join(paths.logsDir, 'launch-agent.stderr.log');
    const envValues = {
        PATH:
            process.env.PATH ??
            '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
        HOME: os.homedir(),
        WILLCLAW_HOME: paths.homeDir,
        ...(await parseEnvFile(config.daemon.env_file)),
    };
    const environmentBlock = renderEnvironmentVariables(envValues);

    const plistLines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
        '<plist version="1.0">',
        '<dict>',
        '  <key>Label</key>',
        `  <string>${xmlEscape(label)}</string>`,
        '  <key>ProgramArguments</key>',
        '  <array>',
        renderStringArray([
            process.execPath,
            path.resolve(options.entryScriptPath),
            'start',
            '--home',
            paths.homeDir,
        ]),
        '  </array>',
        '  <key>RunAtLoad</key>',
        '  <true/>',
        '  <key>KeepAlive</key>',
        '  <false/>',
        '  <key>WorkingDirectory</key>',
        `  <string>${xmlEscape(paths.homeDir)}</string>`,
        '  <key>StandardOutPath</key>',
        `  <string>${xmlEscape(stdoutPath)}</string>`,
        '  <key>StandardErrorPath</key>',
        `  <string>${xmlEscape(stderrPath)}</string>`,
    ];

    if (environmentBlock) {
        plistLines.push(environmentBlock);
    }

    plistLines.push('</dict>', '</plist>');

    return {
        label,
        plistPath,
        stdoutPath,
        stderrPath,
        plist: plistLines.join('\n'),
    };
}

export async function installLaunchAgent(options: {
    homeDir?: string;
    entryScriptPath: string;
}): Promise<LaunchAgentDefinition> {
    const definition = await buildLaunchAgentDefinition(options);
    const userDomain = getUserDomain();

    await mkdir(LAUNCH_AGENTS_DIR, { recursive: true });
    await mkdir(path.dirname(definition.stdoutPath), { recursive: true });
    await writeFile(definition.plistPath, definition.plist, 'utf8');

    try {
        await runLaunchctl(['bootout', userDomain, definition.plistPath]);
    } catch {
        // Ignore if not loaded yet.
    }

    await runLaunchctl(['bootstrap', userDomain, definition.plistPath]);
    await runLaunchctl([
        'kickstart',
        '-k',
        `${userDomain}/${definition.label}`,
    ]).catch(() => undefined);

    return definition;
}

export async function uninstallLaunchAgent(options?: {
    homeDir?: string;
}): Promise<LaunchAgentStatus> {
    const { config } = await loadWillClawConfig(
        createHomeDirOptions(options?.homeDir),
    );
    const label = config.daemon.plist_label;
    const plistPath = path.join(LAUNCH_AGENTS_DIR, `${label}.plist`);
    const userDomain = getUserDomain();
    const installed = await pathExists(plistPath);

    if (installed) {
        try {
            await runLaunchctl(['bootout', userDomain, plistPath]);
        } catch {
            // Ignore if already unloaded.
        }

        await rm(plistPath, { force: true });
    }

    return {
        label,
        plistPath,
        installed,
        loaded: false,
    };
}

export async function getLaunchAgentStatus(options?: {
    homeDir?: string;
}): Promise<LaunchAgentStatus> {
    const { config } = await loadWillClawConfig(
        createHomeDirOptions(options?.homeDir),
    );
    const label = config.daemon.plist_label;
    const plistPath = path.join(LAUNCH_AGENTS_DIR, `${label}.plist`);
    const installed = await pathExists(plistPath);

    try {
        await runLaunchctl(['print', `${getUserDomain()}/${label}`]);
        return {
            label,
            plistPath,
            installed,
            loaded: true,
        };
    } catch (error) {
        return {
            label,
            plistPath,
            installed,
            loaded: false,
            detail: error instanceof Error ? error.message : String(error),
        };
    }
}
