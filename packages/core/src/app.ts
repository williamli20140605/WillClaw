import { access } from 'node:fs/promises';
import path from 'node:path';

import { expandHomeDir, getWillClawPaths } from './paths.js';
import { createWillClawRuntime } from './runtime.js';
import { listHostTools } from './tool-catalog.js';
import { initializeWillClawHome } from './workspace.js';
import { syncWillClawWorkspaceSkills } from './workspace-skills.js';

async function pathExists(targetPath: string): Promise<boolean> {
    try {
        await access(targetPath);
        return true;
    } catch {
        return false;
    }
}

export async function initWillClaw(options?: {
    homeDir?: string;
    forceConfig?: boolean;
}) {
    return initializeWillClawHome(options);
}

export async function startWillClaw(options?: { homeDir?: string }) {
    return await createWillClawRuntime(options);
}

export async function syncWillClawSkills(options?: {
    homeDir?: string;
    workspaceDir?: string;
    overwrite?: boolean;
}) {
    const workspaceDir = options?.workspaceDir
        ? path.resolve(expandHomeDir(options.workspaceDir))
        : getWillClawPaths(options?.homeDir).workspaceDir;

    return await syncWillClawWorkspaceSkills({
        workspaceDir,
        overwrite: options?.overwrite ?? true,
    });
}

export async function getWillClawStatus(options?: { homeDir?: string }) {
    const paths = getWillClawPaths(options?.homeDir);
    const configExists = await pathExists(paths.configPath);

    if (!configExists) {
        return {
            paths,
            configExists,
            configValid: false,
            message: 'config.yaml not found; run `willclaw init` first.',
        };
    }

    try {
        const runtime = await createWillClawRuntime(options);
        const availability = await runtime.orchestrator.listAgents();
        const appLogExists = await pathExists(runtime.config.logging.app_log);

        return {
            paths,
            configExists,
            configValid: true,
            appLogExists,
            config: runtime.config,
            agents: availability,
            hostTools: listHostTools(runtime.config),
        };
    } catch (error) {
        return {
            paths,
            configExists,
            configValid: false,
            message:
                error instanceof Error ? error.message : 'Failed to load config.',
        };
    }
}
