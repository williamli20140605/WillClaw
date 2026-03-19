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
    actions: ProviderActionHealth[];
}

export interface ProviderActionHealth {
    action: string;
    available: boolean;
    healthy: boolean;
    detail: string;
}

export function getHealthyProviderActions(
    health: ProviderHealthEntry[],
    tool: ProviderHealthEntry['tool'],
): string[] {
    const allowed = new Set<string>();

    for (const entry of health) {
        if (entry.tool !== tool) {
            continue;
        }

        for (const action of entry.actions) {
            if (action.healthy) {
                allowed.add(action.action);
            }
        }
    }

    return [...allowed];
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
    const actions: ProviderActionHealth[] = [
        'open',
        'snapshot',
        'click',
        'type',
        'screenshot',
    ].map((action) => ({
        action,
        available: installed,
        healthy: installed,
        detail: installed
            ? 'agent-browser is installed for structured browser actions'
            : 'agent-browser is not installed',
    }));

    return {
        tool: 'browser',
        provider: 'agent-browser',
        configured,
        available: installed,
        healthy: installed,
        detail: installed
            ? 'agent-browser binary is available'
            : 'agent-browser is not installed',
        actions,
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
            actions: [
                {
                    action: 'open',
                    available: false,
                    healthy: false,
                    detail: `system-open is not implemented on ${process.platform}`,
                },
                {
                    action: 'snapshot',
                    available: false,
                    healthy: false,
                    detail: 'system-open cannot inspect page structure',
                },
                {
                    action: 'click',
                    available: false,
                    healthy: false,
                    detail: 'system-open cannot click browser elements',
                },
                {
                    action: 'type',
                    available: false,
                    healthy: false,
                    detail: 'system-open cannot type into browser elements',
                },
                {
                    action: 'screenshot',
                    available: false,
                    healthy: false,
                    detail: 'system-open cannot capture browser screenshots',
                },
            ],
        };
    }

    const installed = await commandExists(command);
    const actions: ProviderActionHealth[] = [
        {
            action: 'open',
            available: installed,
            healthy: installed,
            detail: installed
                ? `${command} can open URLs`
                : `${command} is not available on this host`,
        },
        {
            action: 'snapshot',
            available: false,
            healthy: false,
            detail: 'system-open cannot inspect page structure',
        },
        {
            action: 'click',
            available: false,
            healthy: false,
            detail: 'system-open cannot click browser elements',
        },
        {
            action: 'type',
            available: false,
            healthy: false,
            detail: 'system-open cannot type into browser elements',
        },
        {
            action: 'screenshot',
            available: false,
            healthy: false,
            detail: 'system-open cannot capture browser screenshots',
        },
    ];
    return {
        tool: 'browser',
        provider: 'system-open',
        configured,
        available: installed,
        healthy: installed,
        detail: installed
            ? `${command} is available`
            : `${command} is not available on this host`,
        actions,
    };
}

async function checkPeekaboo(config: WillClawConfig): Promise<ProviderHealthEntry> {
    const configured = config.tools.screen.providers.includes('peekaboo');
    const installed = await commandExists('peekaboo');
    const visionAvailable = await commandExists('xcrun');

    if (!installed) {
        return {
            tool: 'screen',
            provider: 'peekaboo',
            configured,
            available: false,
            healthy: false,
            detail: 'peekaboo is not installed',
            actions: ['capture', 'ocr', 'see', 'click', 'type', 'press'].map((action) => ({
                action,
                available: false,
                healthy: false,
                detail: 'peekaboo is not installed',
            })),
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
        const actions: ProviderActionHealth[] = [
            {
                action: 'capture',
                available: true,
                healthy: screenGranted,
                detail: screenGranted
                    ? 'Screen Recording permission is granted'
                    : 'Requires Screen Recording permission',
            },
            {
                action: 'see',
                available: true,
                healthy: screenGranted,
                detail: screenGranted
                    ? 'Screen Recording permission is granted'
                    : 'Requires Screen Recording permission',
            },
            {
                action: 'ocr',
                available: visionAvailable,
                healthy: screenGranted && visionAvailable,
                detail:
                    !visionAvailable
                        ? 'Requires xcrun/swift for Apple Vision OCR'
                        : screenGranted
                            ? 'Apple Vision OCR is available after capture'
                            : 'Requires Screen Recording permission before OCR capture',
            },
            {
                action: 'click',
                available: true,
                healthy: accessibilityGranted,
                detail: accessibilityGranted
                    ? 'Accessibility permission is granted'
                    : 'Requires Accessibility permission',
            },
            {
                action: 'type',
                available: true,
                healthy: accessibilityGranted,
                detail: accessibilityGranted
                    ? 'Accessibility permission is granted'
                    : 'Requires Accessibility permission',
            },
            {
                action: 'press',
                available: true,
                healthy: accessibilityGranted,
                detail: accessibilityGranted
                    ? 'Accessibility permission is granted'
                    : 'Requires Accessibility permission',
            },
        ];

        return {
            tool: 'screen',
            provider: 'peekaboo',
            configured,
            available: true,
            healthy,
            detail: healthy
                ? 'peekaboo installed and required permissions are granted'
                : 'peekaboo installed but Screen Recording or Accessibility permission is missing',
            actions,
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
            actions: ['capture', 'ocr', 'see', 'click', 'type', 'press'].map((action) => ({
                action,
                available: true,
                healthy: false,
                detail: 'Peekaboo permission check failed',
            })),
            installHint:
                'Run `peekaboo permissions status` to inspect Screen Recording and Accessibility access',
        };
    }
}

async function checkScreencapture(config: WillClawConfig): Promise<ProviderHealthEntry> {
    const configured = config.tools.screen.providers.includes('screencapture');
    const visionAvailable = await commandExists('xcrun');
    if (process.platform !== 'darwin') {
        return {
            tool: 'screen',
            provider: 'screencapture',
            configured,
            available: false,
            healthy: false,
            detail: `screencapture is not available on ${process.platform}`,
            actions: ['capture', 'ocr', 'see', 'click', 'type', 'press'].map((action) => ({
                action,
                available: false,
                healthy: false,
                detail:
                    action === 'capture'
                        ? `screencapture is not available on ${process.platform}`
                        : 'screencapture only supports basic capture on macOS',
            })),
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
        actions: [
            {
                action: 'capture',
                available: installed,
                healthy: installed,
                detail: installed
                    ? 'Basic screen capture is available'
                    : 'screencapture is not available on this host',
            },
            {
                action: 'see',
                available: false,
                healthy: false,
                detail: 'screencapture cannot analyze UI elements',
            },
            {
                action: 'ocr',
                available: installed && visionAvailable,
                healthy: installed && visionAvailable,
                detail:
                    installed && visionAvailable
                        ? 'Apple Vision OCR is available after screencapture capture'
                        : !visionAvailable
                            ? 'Requires xcrun/swift for Apple Vision OCR'
                            : 'screencapture is not available on this host',
            },
            {
                action: 'click',
                available: false,
                healthy: false,
                detail: 'screencapture cannot click UI elements',
            },
            {
                action: 'type',
                available: false,
                healthy: false,
                detail: 'screencapture cannot type into applications',
            },
            {
                action: 'press',
                available: false,
                healthy: false,
                detail: 'screencapture cannot send key presses',
            },
        ],
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
