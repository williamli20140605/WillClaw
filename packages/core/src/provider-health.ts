import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type {
    BrowserToolProvider,
    ScreenToolProvider,
    WillClawConfig,
} from './config.js';

const execFileAsync = promisify(execFile);

export interface ProviderHealthEntry {
    tool: 'browser' | 'screen';
    provider: BrowserToolProvider | ScreenToolProvider;
    configured: boolean;
    available: boolean;
    healthy: boolean;
    detail: string;
    installHint?: string;
}

async function commandExists(command: string): Promise<boolean> {
    try {
        await execFileAsync('which', [command]);
        return true;
    } catch {
        return false;
    }
}

async function checkAgentBrowser(config: WillClawConfig): Promise<ProviderHealthEntry> {
    const configured = config.tools.browser.providers.includes('agent-browser');
    const installed = await commandExists('agent-browser');

    return {
        tool: 'browser',
        provider: 'agent-browser',
        configured,
        available: installed,
        healthy: installed,
        detail: installed
            ? 'agent-browser binary is available'
            : 'agent-browser is not installed',
        ...(!installed
            ? { installHint: 'brew install agent-browser && agent-browser install' }
            : {}),
    };
}

async function checkSystemOpen(config: WillClawConfig): Promise<ProviderHealthEntry> {
    const configured = config.tools.browser.providers.includes('system-open');
    const command =
        process.platform === 'darwin'
            ? 'open'
            : process.platform === 'linux'
                ? 'xdg-open'
                : null;

    if (!command) {
        return {
            tool: 'browser',
            provider: 'system-open',
            configured,
            available: false,
            healthy: false,
            detail: `system-open is not implemented on ${process.platform}`,
        };
    }

    const installed = await commandExists(command);
    return {
        tool: 'browser',
        provider: 'system-open',
        configured,
        available: installed,
        healthy: installed,
        detail: installed
            ? `${command} is available`
            : `${command} is not available on this host`,
    };
}

async function checkPeekaboo(config: WillClawConfig): Promise<ProviderHealthEntry> {
    const configured = config.tools.screen.providers.includes('peekaboo');
    const installed = await commandExists('peekaboo');

    if (!installed) {
        return {
            tool: 'screen',
            provider: 'peekaboo',
            configured,
            available: false,
            healthy: false,
            detail: 'peekaboo is not installed',
            installHint: 'brew install steipete/tap/peekaboo',
        };
    }

    try {
        const { stdout } = await execFileAsync('peekaboo', ['permissions', 'status']);
        const normalized = stdout.toLowerCase();
        const screenGranted =
            normalized.includes('screen recording') &&
            normalized.includes('granted');
        const accessibilityGranted =
            normalized.includes('accessibility') &&
            normalized.includes('granted');
        const healthy = screenGranted && accessibilityGranted;

        return {
            tool: 'screen',
            provider: 'peekaboo',
            configured,
            available: true,
            healthy,
            detail: healthy
                ? 'peekaboo installed and required permissions are granted'
                : 'peekaboo installed but Screen Recording or Accessibility permission is missing',
            ...(!healthy
                ? {
                    installHint:
                        'Run `peekaboo permissions status` and grant Screen Recording + Accessibility if needed',
                }
                : {}),
        };
    } catch (error) {
        return {
            tool: 'screen',
            provider: 'peekaboo',
            configured,
            available: true,
            healthy: false,
            detail:
                error instanceof Error
                    ? `peekaboo permission check failed: ${error.message}`
                    : 'peekaboo permission check failed',
            installHint:
                'Run `peekaboo permissions status` to inspect Screen Recording and Accessibility access',
        };
    }
}

async function checkScreencapture(config: WillClawConfig): Promise<ProviderHealthEntry> {
    const configured = config.tools.screen.providers.includes('screencapture');
    if (process.platform !== 'darwin') {
        return {
            tool: 'screen',
            provider: 'screencapture',
            configured,
            available: false,
            healthy: false,
            detail: `screencapture is not available on ${process.platform}`,
        };
    }

    const installed = await commandExists('screencapture');
    return {
        tool: 'screen',
        provider: 'screencapture',
        configured,
        available: installed,
        healthy: installed,
        detail: installed
            ? 'screencapture is available'
            : 'screencapture is not available on this host',
    };
}

export async function getProviderHealth(
    config: WillClawConfig,
): Promise<ProviderHealthEntry[]> {
    return await Promise.all([
        checkAgentBrowser(config),
        checkSystemOpen(config),
        checkPeekaboo(config),
        checkScreencapture(config),
    ]);
}
