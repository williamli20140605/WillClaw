#!/usr/bin/env node

import { Command } from 'commander';

import {
    ChannelManager,
    getWillClawStatus,
    initWillClaw,
    listenWithRuntime,
    startWillClaw,
    syncWillClawSkills,
} from '@willclaw/core';

import {
    buildLaunchAgentDefinition,
    getLaunchAgentStatus,
    installLaunchAgent,
    uninstallLaunchAgent,
} from './launch-agent.js';

const program = new Command();
const TOOL_LABELS = {
    shell: 'terminal',
    filesystem: 'filesystem',
    browser: 'browser',
    screen: 'screen',
    memory_search: 'memory',
} as const;

function formatToolPolicies(toolPolicies: Record<string, string>): string {
    return Object.entries(TOOL_LABELS)
        .map(
            ([toolName, label]) => `${label}=${toolPolicies[toolName] ?? 'disabled'}`,
        )
        .join(' ');
}

function formatHostTool(tool: {
    label: string;
    category: string;
    globalEnabled: boolean;
    preferredProvider?: string;
    fallbackProvider?: string;
}): string {
    const providers = tool.preferredProvider
        ? tool.fallbackProvider
            ? `${tool.preferredProvider} -> ${tool.fallbackProvider}`
            : tool.preferredProvider
        : 'n/a';

    return `Host tool ${tool.label}: ${tool.globalEnabled ? 'enabled' : 'disabled'} (${tool.category}; providers=${providers})`;
}

program.name('willclaw').description('WillClaw CLI').version('0.1.0');

program
    .command('init')
    .description('Initialize the WillClaw home directory structure.')
    .option('--home <path>', 'override the default ~/.willclaw home directory')
    .option('--force-config', 'overwrite config.yaml if it already exists', false)
    .action(async (options: { home?: string; forceConfig: boolean }) => {
        const result = await initWillClaw(
            options.home
                ? {
                    homeDir: options.home,
                    forceConfig: options.forceConfig,
                }
                : {
                    forceConfig: options.forceConfig,
                },
        );

        console.log(`WillClaw home: ${result.paths.homeDir}`);
        console.log(
            `Config: ${result.createdConfig ? 'created' : 'kept existing'} (${result.paths.configPath})`,
        );
        console.log(`Workspace: ${result.paths.workspaceDir}`);
        console.log(`Skills: ${result.paths.workspaceSkillsDir}`);
        console.log(`Logs: ${result.paths.logsDir}`);
        console.log(`History: ${result.paths.historyDir}`);
    });

program
    .command('start')
    .description('Initialize the runtime and start the WillClaw HTTP server.')
    .option('--home <path>', 'override the default ~/.willclaw home directory')
    .option('--no-listen', 'initialize runtime without binding the HTTP server')
    .action(async (options: { home?: string; listen: boolean }) => {
        const runtime = await startWillClaw(
            options.home ? { homeDir: options.home } : undefined,
        );
        const channelManager = new ChannelManager(
            runtime.config,
            runtime.chatService,
            runtime.logger,
            runtime.paths.homeDir,
        );

        console.log('WillClaw runtime initialized.');
        console.log(`Home: ${runtime.paths.homeDir}`);
        console.log(`Config: ${runtime.paths.configPath}`);
        console.log(`App log: ${runtime.config.logging.app_log}`);

        if (!options.listen) {
            console.log('HTTP server not started (`--no-listen`).');
            return;
        }

        const startedChannels = await channelManager.start();
        runtime.backgroundTaskEngine.setChannelNotifier(channelManager);
        runtime.scheduler.start();
        if (startedChannels.length > 0) {
            console.log(`Channels: ${startedChannels.join(', ')}`);
        }

        const { server } = await listenWithRuntime(runtime);
        console.log(`HTTP server: http://${server.hostname}:${server.port}`);
        console.log('Press Ctrl+C to stop.');

        const shutdown = async (signal: string) => {
            console.log(`Received ${signal}, shutting down...`);
            runtime.scheduler.stop();
            runtime.backgroundTaskEngine.setChannelNotifier(null);
            await channelManager.stop();
            await server.close();
            process.exit(0);
        };

        process.once('SIGINT', () => {
            void shutdown('SIGINT');
        });
        process.once('SIGTERM', () => {
            void shutdown('SIGTERM');
        });
    });

const launchAgent = program
    .command('launch-agent')
    .description('Manage macOS login auto-start via LaunchAgent.');

launchAgent
    .command('install')
    .description(
        'Install and load the WillClaw LaunchAgent for the current user.',
    )
    .option('--home <path>', 'override the default ~/.willclaw home directory')
    .action(async (options: { home?: string }) => {
        const installOptions: Parameters<typeof installLaunchAgent>[0] = {
            entryScriptPath: process.argv[1] ?? 'dist/index.js',
        };

        if (options.home) {
            installOptions.homeDir = options.home;
        }

        const result = await installLaunchAgent(installOptions);

        console.log(`Label: ${result.label}`);
        console.log(`Plist: ${result.plistPath}`);
        console.log(`Stdout: ${result.stdoutPath}`);
        console.log(`Stderr: ${result.stderrPath}`);
    });

launchAgent
    .command('uninstall')
    .description(
        'Unload and remove the WillClaw LaunchAgent for the current user.',
    )
    .option('--home <path>', 'override the default ~/.willclaw home directory')
    .action(async (options: { home?: string }) => {
        const uninstallOptions: Parameters<typeof uninstallLaunchAgent>[0] = {};

        if (options.home) {
            uninstallOptions.homeDir = options.home;
        }

        const result = await uninstallLaunchAgent(uninstallOptions);

        console.log(`Label: ${result.label}`);
        console.log(`Plist: ${result.plistPath}`);
        console.log(`Previously installed: ${result.installed ? 'yes' : 'no'}`);
    });

launchAgent
    .command('status')
    .description('Show whether the WillClaw LaunchAgent is installed and loaded.')
    .option('--home <path>', 'override the default ~/.willclaw home directory')
    .action(async (options: { home?: string }) => {
        const statusOptions: Parameters<typeof getLaunchAgentStatus>[0] = {};

        if (options.home) {
            statusOptions.homeDir = options.home;
        }

        const result = await getLaunchAgentStatus(statusOptions);

        console.log(`Label: ${result.label}`);
        console.log(`Plist: ${result.plistPath}`);
        console.log(`Installed: ${result.installed ? 'yes' : 'no'}`);
        console.log(`Loaded: ${result.loaded ? 'yes' : 'no'}`);

        if (result.detail) {
            console.log(`Detail: ${result.detail}`);
        }
    });

launchAgent
    .command('print')
    .description('Print the generated LaunchAgent plist without installing it.')
    .option('--home <path>', 'override the default ~/.willclaw home directory')
    .action(async (options: { home?: string }) => {
        const printOptions: Parameters<typeof buildLaunchAgentDefinition>[0] = {
            entryScriptPath: process.argv[1] ?? 'dist/index.js',
        };

        if (options.home) {
            printOptions.homeDir = options.home;
        }

        const result = await buildLaunchAgentDefinition(printOptions);

        console.log(result.plist);
    });

program
    .command('status')
    .description('Show whether the local WillClaw home and config are ready.')
    .option('--home <path>', 'override the default ~/.willclaw home directory')
    .action(async (options: { home?: string }) => {
        const status = await getWillClawStatus(
            options.home ? { homeDir: options.home } : undefined,
        );

        console.log(`Home: ${status.paths.homeDir}`);
        console.log(`Config exists: ${status.configExists ? 'yes' : 'no'}`);
        console.log(`Config valid: ${status.configValid ? 'yes' : 'no'}`);

        if ('appLogExists' in status) {
            console.log(`App log exists: ${status.appLogExists ? 'yes' : 'no'}`);
        }

        if ('agents' in status && status.agents) {
            for (const agent of status.agents) {
                console.log(
                    `Agent ${agent.name} (${agent.type}): ${agent.available ? 'available' : 'unavailable'} | ${formatToolPolicies(agent.toolPolicies)}`,
                );
            }
        }

        if ('hostTools' in status && status.hostTools) {
            for (const tool of status.hostTools) {
                console.log(formatHostTool(tool));
            }
        }

        if ('message' in status && status.message) {
            console.log(`Note: ${status.message}`);
        }
    });

program
    .command('sync-skills')
    .description('Refresh generated SKILLS.md, SKILLS_INDEX.md, and skills/*.')
    .option(
        '--home <path>',
        'use the workspace inside the specified WillClaw home',
    )
    .option('--workspace-dir <path>', 'write to an explicit workspace directory')
    .option('--no-overwrite', 'keep existing generated files when present')
    .action(
        async (options: {
            home?: string;
            workspaceDir?: string;
            overwrite: boolean;
        }) => {
            const syncOptions: Parameters<typeof syncWillClawSkills>[0] = {
                overwrite: options.overwrite,
            };

            if (options.home) {
                syncOptions.homeDir = options.home;
            }

            if (options.workspaceDir) {
                syncOptions.workspaceDir = options.workspaceDir;
            }

            const result = await syncWillClawSkills(syncOptions);

            console.log(`Workspace: ${result.workspaceDir}`);
            console.log(`Skills: ${result.skillsDir}`);
            console.log(`Files written: ${result.filesWritten.length}`);

            for (const filePath of result.filesWritten) {
                console.log(filePath);
            }
        },
    );

program
    .command('agents')
    .description('List configured agents and whether they are locally available.')
    .option('--home <path>', 'override the default ~/.willclaw home directory')
    .action(async (options: { home?: string }) => {
        const status = await getWillClawStatus(
            options.home ? { homeDir: options.home } : undefined,
        );

        if (!('agents' in status) || !status.agents) {
            console.log('No valid config loaded.');
            if ('message' in status && status.message) {
                console.log(`Note: ${status.message}`);
            }
            return;
        }

        for (const agent of status.agents) {
            console.log(
                `${agent.name}\t${agent.type}\t${agent.available ? 'available' : 'unavailable'}\t${formatToolPolicies(agent.toolPolicies)}`,
            );
        }
    });

program.parseAsync(process.argv).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`WillClaw error: ${message}`);
    process.exitCode = 1;
});
