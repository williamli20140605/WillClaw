import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { Logger } from 'pino';

import type { BrowserTool } from './tools/browser.js';
import type { ScreenTool } from './tools/screen.js';

export const HOSTED_ACTION_BRIDGE_PREFIX = 'WILLCLAW_HOSTED_ACTION';

export type HostedActionTool = 'browser' | 'screen';

export interface HostedActionContext {
    runId: string;
    agent: string;
    channel?: string;
    chatId?: string;
}

export interface HostedActionRequest {
    tool: HostedActionTool;
    action: string;
    payload: Record<string, unknown>;
}

export interface HostedActionUse {
    tool: HostedActionTool;
    action: string;
    provider?: string;
    success: boolean;
}

export interface HostedActionExecutionResult {
    tool: HostedActionTool;
    action: string;
    provider?: string;
    output: string;
    data?: unknown;
    artifactPath?: string;
}

function parseBridgePayload(payload: string): Record<string, unknown> | null {
    try {
        const parsed = JSON.parse(payload) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
        }
    } catch {
        return null;
    }

    return null;
}

function readBoolean(
    payload: Record<string, unknown>,
    key: string,
): boolean | undefined {
    return typeof payload[key] === 'boolean'
        ? (payload[key] as boolean)
        : undefined;
}

function readNumber(
    payload: Record<string, unknown>,
    key: string,
): number | undefined {
    return typeof payload[key] === 'number' && Number.isFinite(payload[key])
        ? (payload[key] as number)
        : undefined;
}

function readString(
    payload: Record<string, unknown>,
    key: string,
): string | undefined {
    const value = payload[key];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readStringArray(
    payload: Record<string, unknown>,
    key: string,
): string[] | undefined {
    const value = payload[key];
    if (!Array.isArray(value)) {
        return undefined;
    }

    const entries = value.filter(
        (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
    );
    return entries.length > 0 ? entries.map((entry) => entry.trim()) : undefined;
}

function readObjectArray(
    payload: Record<string, unknown>,
    key: string,
): Record<string, unknown>[] | undefined {
    const value = payload[key];
    if (!Array.isArray(value)) {
        return undefined;
    }

    const entries = value.filter(
        (entry): entry is Record<string, unknown> =>
            Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry),
    );
    return entries.length > 0 ? entries : undefined;
}

function truncateForPrompt(value: string, maxChars = 4_000): string {
    if (value.length <= maxChars) {
        return value;
    }

    return `${value.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function defaultArtifactPath(prefix: string, extension: string): string {
    const filename = `willclaw-${prefix}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}.${extension}`;
    return path.join(tmpdir(), filename);
}

function formatResultData(data: unknown): string | null {
    if (!data || typeof data !== 'object') {
        return null;
    }

    const record = data as Record<string, unknown>;
    const nested =
        record.data && typeof record.data === 'object' && !Array.isArray(record.data)
            ? (record.data as Record<string, unknown>)
            : null;

    if (nested && typeof nested.snapshot === 'string' && nested.snapshot.trim()) {
        return truncateForPrompt(nested.snapshot.trim(), 3_500);
    }

    if (nested && Array.isArray(nested.files) && nested.files.length > 0) {
        const files = nested.files
            .map((entry) => {
                if (!entry || typeof entry !== 'object') {
                    return null;
                }

                const item = entry as Record<string, unknown>;
                const filePath = typeof item.path === 'string' ? item.path : null;
                const label = typeof item.item_label === 'string' ? item.item_label : null;
                if (!filePath) {
                    return null;
                }

                return label ? `${label}: ${filePath}` : filePath;
            })
            .filter((entry): entry is string => Boolean(entry));

        if (files.length > 0) {
            return files.join('\n');
        }
    }

    return truncateForPrompt(JSON.stringify(data, null, 2), 3_500);
}

export function renderHostedActionBridgeInstructions(options: {
    browserActions: string[];
    screenActions: string[];
}): string | null {
    const lines: string[] = [];

    if (options.browserActions.length > 0) {
        lines.push(
            'WillClaw exposes a hosted browser bridge.',
            `If you need browser help, reply with exactly one line and nothing else:`,
        );

        if (options.browserActions.includes('open')) {
            lines.push(
                `${HOSTED_ACTION_BRIDGE_PREFIX} {"tool":"browser","action":"open","target":"https://example.com"}`,
            );
        }
        if (options.browserActions.includes('snapshot')) {
            lines.push(
                `${HOSTED_ACTION_BRIDGE_PREFIX} {"tool":"browser","action":"snapshot","interactive":true,"compact":true}`,
            );
        }
        if (options.browserActions.includes('inspect_page')) {
            lines.push(
                `${HOSTED_ACTION_BRIDGE_PREFIX} {"tool":"browser","action":"inspect_page","target":"https://example.com","interactive":true,"compact":true}`,
            );
        }
        if (options.browserActions.includes('fill_form')) {
            lines.push(
                `${HOSTED_ACTION_BRIDGE_PREFIX} {"tool":"browser","action":"fill_form","target":"https://example.com/login","fields":[{"selector":"#email","text":"user@example.com","clear":true},{"selector":"#password","text":"secret","clear":true}],"submitSelector":"button[type=submit]"}`,
            );
        }
        if (options.browserActions.includes('click')) {
            lines.push(
                `${HOSTED_ACTION_BRIDGE_PREFIX} {"tool":"browser","action":"click","selector":"@e2"}`,
            );
        }
        if (options.browserActions.includes('type')) {
            lines.push(
                `${HOSTED_ACTION_BRIDGE_PREFIX} {"tool":"browser","action":"type","selector":"@e3","text":"hello","clear":true}`,
            );
        }
        if (options.browserActions.includes('screenshot')) {
            lines.push(
                `${HOSTED_ACTION_BRIDGE_PREFIX} {"tool":"browser","action":"screenshot","filePath":"/tmp/browser.png","fullPage":true}`,
            );
        }

        lines.push(
            `Allowed browser actions right now: ${options.browserActions.join(', ')}.`,
        );

        if (
            options.browserActions.includes('open') &&
            options.browserActions.length === 1
        ) {
            lines.push(
                'Only plain URL open is currently healthy; structured browser automation is unavailable.',
            );
        } else {
            lines.push(
                'Structured browser actions depend on agent-browser; plain URL open can still fall back to system-open.',
                'Use inspect_page when you want WillClaw to open a URL and return a structured page snapshot in one hosted step.',
                'Use fill_form when you want WillClaw to open a page, populate one or more fields, optionally submit, and return an updated snapshot.',
            );
        }
    }

    if (options.screenActions.length > 0) {
        lines.push(
            'WillClaw exposes a hosted screen/desktop bridge.',
            `If you need desktop vision or interaction, reply with exactly one line and nothing else:`,
        );

        if (options.screenActions.includes('capture')) {
            lines.push(
                `${HOSTED_ACTION_BRIDGE_PREFIX} {"tool":"screen","action":"capture","mode":"screen","filePath":"/tmp/screen.png"}`,
            );
        }
        if (options.screenActions.includes('see')) {
            lines.push(
                `${HOSTED_ACTION_BRIDGE_PREFIX} {"tool":"screen","action":"see","mode":"frontmost","path":"/tmp/see.png"}`,
            );
        }
        if (options.screenActions.includes('ocr')) {
            lines.push(
                `${HOSTED_ACTION_BRIDGE_PREFIX} {"tool":"screen","action":"ocr","mode":"screen","languages":["en-US","zh-Hans"]}`,
            );
        }
        if (options.screenActions.includes('frontmost_app')) {
            lines.push(
                `${HOSTED_ACTION_BRIDGE_PREFIX} {"tool":"screen","action":"frontmost_app"}`,
            );
        }
        if (options.screenActions.includes('open_app')) {
            lines.push(
                `${HOSTED_ACTION_BRIDGE_PREFIX} {"tool":"screen","action":"open_app","app":"Finder"}`,
            );
        }
        if (options.screenActions.includes('activate_app')) {
            lines.push(
                `${HOSTED_ACTION_BRIDGE_PREFIX} {"tool":"screen","action":"activate_app","app":"Terminal"}`,
            );
        }
        if (options.screenActions.includes('inspect_app')) {
            lines.push(
                `${HOSTED_ACTION_BRIDGE_PREFIX} {"tool":"screen","action":"inspect_app","app":"Terminal","languages":["en-US","zh-Hans"]}`,
            );
        }
        if (options.screenActions.includes('click')) {
            lines.push(
                `${HOSTED_ACTION_BRIDGE_PREFIX} {"tool":"screen","action":"click","elementId":"B1","app":"Terminal"}`,
            );
        }
        if (options.screenActions.includes('type')) {
            lines.push(
                `${HOSTED_ACTION_BRIDGE_PREFIX} {"tool":"screen","action":"type","text":"hello","app":"Terminal","pressReturn":true}`,
            );
        }
        if (options.screenActions.includes('press')) {
            lines.push(
                `${HOSTED_ACTION_BRIDGE_PREFIX} {"tool":"screen","action":"press","keys":["tab","return"],"app":"Terminal"}`,
            );
        }

        lines.push(
            `Allowed screen actions right now: ${options.screenActions.join(', ')}.`,
            'Use frontmost_app/open_app/activate_app when you need to move the host desktop to the right app before vision or input.',
            'Use inspect_app when you want a single hosted step that foregrounds an app, captures the screen, and OCRs the visible UI.',
            'Desktop click/type/press require macOS Accessibility permission for the host app running WillClaw.',
        );
    }

    if (lines.length === 0) {
        return null;
    }

    lines.push(
        'After WillClaw returns the hosted action result, continue the task and send the final assistant answer.',
    );

    return lines.join('\n');
}

export function formatHostedActionRestriction(options: {
    request: HostedActionRequest;
    allowedActions: Partial<Record<HostedActionTool, string[]>>;
}): string {
    const allowed = options.allowedActions[options.request.tool] ?? [];
    const supportedList =
        allowed.length > 0 ? allowed.join(', ') : 'none currently available';

    return [
        `WillClaw blocked hosted action: ${options.request.tool}.${options.request.action}`,
        `Allowed ${options.request.tool} actions right now: ${supportedList}`,
        'Choose one of the allowed actions or continue without the hosted bridge.',
    ].join('\n');
}

export class HostedActionService {
    constructor(
        private readonly browserTool: BrowserTool,
        private readonly screenTool: ScreenTool,
        private readonly logger: Logger,
    ) { }

    parseBridgeRequest(content: string): HostedActionRequest | null {
        const trimmed = content.trim();
        if (!trimmed.startsWith(HOSTED_ACTION_BRIDGE_PREFIX)) {
            return null;
        }

        const payload = trimmed.slice(HOSTED_ACTION_BRIDGE_PREFIX.length).trim();
        if (!payload.startsWith('{')) {
            return null;
        }

        const parsed = parseBridgePayload(payload);
        if (!parsed) {
            return null;
        }

        const tool = readString(parsed, 'tool');
        const action = readString(parsed, 'action');
        if (!tool || !action) {
            return null;
        }

        if (tool !== 'browser' && tool !== 'screen') {
            return null;
        }

        return {
            tool,
            action,
            payload: parsed,
        };
    }

    async execute(
        request: HostedActionRequest,
        context: HostedActionContext,
    ): Promise<HostedActionExecutionResult> {
        if (request.tool === 'browser') {
            return await this.executeBrowserAction(request, context);
        }

        return await this.executeScreenAction(request, context);
    }

    formatToolResult(
        request: HostedActionRequest,
        result: HostedActionExecutionResult,
    ): string {
        const lines = [
            `WillClaw hosted action result: ${request.tool}.${request.action}`,
        ];

        if (result.provider) {
            lines.push(`Provider: ${result.provider}`);
        }

        if (result.artifactPath) {
            lines.push(`Artifact: ${result.artifactPath}`);
        }

        lines.push(`Output: ${truncateForPrompt(result.output, 1_600)}`);

        const detail = formatResultData(result.data);
        if (detail) {
            lines.push('Details:');
            lines.push(detail);
        }

        return lines.join('\n');
    }

    formatToolError(request: HostedActionRequest, error: unknown): string {
        const detail =
            error instanceof Error ? error.message : 'Unknown hosted action failure';

        return [
            `WillClaw hosted action failed: ${request.tool}.${request.action}`,
            `Error: ${truncateForPrompt(detail, 1_800)}`,
        ].join('\n');
    }

    private async executeBrowserAction(
        request: HostedActionRequest,
        context: HostedActionContext,
    ): Promise<HostedActionExecutionResult> {
        const toolContext = {
            triggeredBy: context.agent,
            ...(context.chatId ? { chatId: context.chatId } : {}),
            sessionName: `agent-${context.runId}`,
        };

        switch (request.action) {
            case 'open': {
                const target = readString(request.payload, 'target');
                if (!target) {
                    throw new Error('browser.open requires a target URL');
                }

                const result = await this.browserTool.openUrl(target, toolContext);
                return {
                    tool: 'browser',
                    action: 'open',
                    provider: result.provider,
                    output: `Opened ${result.target}`,
                };
            }
            case 'snapshot': {
                const interactive = readBoolean(request.payload, 'interactive');
                const compact = readBoolean(request.payload, 'compact');
                const depth = readNumber(request.payload, 'depth');
                const selector = readString(request.payload, 'selector');
                const result = await this.browserTool.snapshot(
                    {
                        ...(interactive !== undefined ? { interactive } : {}),
                        ...(compact !== undefined ? { compact } : {}),
                        ...(depth !== undefined ? { depth } : {}),
                        ...(selector ? { selector } : {}),
                    },
                    toolContext,
                );
                return {
                    tool: 'browser',
                    action: 'snapshot',
                    provider: result.provider,
                    output: result.output,
                    data: result.data,
                };
            }
            case 'inspect_page': {
                const target = readString(request.payload, 'target');
                if (!target) {
                    throw new Error('browser.inspect_page requires a target URL');
                }

                const interactive = readBoolean(request.payload, 'interactive');
                const compact = readBoolean(request.payload, 'compact');
                const depth = readNumber(request.payload, 'depth');
                const selector = readString(request.payload, 'selector');
                const screenshot = readBoolean(request.payload, 'screenshot');
                const screenshotPath = readString(request.payload, 'screenshotPath');
                const fullPage = readBoolean(request.payload, 'fullPage');
                const result = await this.browserTool.inspectPage(
                    {
                        target,
                        ...(interactive !== undefined ? { interactive } : {}),
                        ...(compact !== undefined ? { compact } : {}),
                        ...(depth !== undefined ? { depth } : {}),
                        ...(selector ? { selector } : {}),
                        ...(screenshot !== undefined ? { screenshot } : {}),
                        ...(screenshotPath ? { screenshotPath } : {}),
                        ...(fullPage !== undefined ? { fullPage } : {}),
                    },
                    toolContext,
                );

                return {
                    tool: 'browser',
                    action: 'inspect_page',
                    provider: result.snapshot.provider,
                    output: result.snapshot.output,
                    data: {
                        target: result.target,
                        open: result.open,
                        snapshot: result.snapshot,
                        ...(result.screenshot
                            ? { screenshot: result.screenshot }
                            : {}),
                    },
                    ...(result.screenshot
                        ? { artifactPath: result.screenshot.filePath }
                        : {}),
                };
            }
            case 'fill_form': {
                const target = readString(request.payload, 'target');
                const submitSelector = readString(request.payload, 'submitSelector');
                const snapshotAfter = readBoolean(request.payload, 'snapshotAfter');
                const interactive = readBoolean(request.payload, 'interactive');
                const compact = readBoolean(request.payload, 'compact');
                const depth = readNumber(request.payload, 'depth');
                const selector = readString(request.payload, 'selector');
                const screenshot = readBoolean(request.payload, 'screenshot');
                const screenshotPath = readString(request.payload, 'screenshotPath');
                const fullPage = readBoolean(request.payload, 'fullPage');
                const fieldsPayload = readObjectArray(request.payload, 'fields') ?? [];

                const fields = fieldsPayload
                    .map((entry) => {
                        const fieldSelector = readString(entry, 'selector');
                        const text = readString(entry, 'text') ?? '';
                        const clear = readBoolean(entry, 'clear');
                        if (!fieldSelector || !text) {
                            return null;
                        }

                        return {
                            selector: fieldSelector,
                            text,
                            ...(clear !== undefined ? { clear } : {}),
                        };
                    })
                    .filter(
                        (entry): entry is { selector: string; text: string; clear?: boolean } =>
                            entry !== null,
                    );

                if (fields.length === 0) {
                    throw new Error('browser.fill_form requires at least one field');
                }

                const result = await this.browserTool.fillForm(
                    {
                        ...(target ? { target } : {}),
                        fields,
                        ...(submitSelector ? { submitSelector } : {}),
                        ...(snapshotAfter !== undefined ? { snapshotAfter } : {}),
                        ...(interactive !== undefined ? { interactive } : {}),
                        ...(compact !== undefined ? { compact } : {}),
                        ...(depth !== undefined ? { depth } : {}),
                        ...(selector ? { selector } : {}),
                        ...(screenshot !== undefined ? { screenshot } : {}),
                        ...(screenshotPath ? { screenshotPath } : {}),
                        ...(fullPage !== undefined ? { fullPage } : {}),
                    },
                    toolContext,
                );

                const response: HostedActionExecutionResult = {
                    tool: 'browser',
                    action: 'fill_form',
                    output:
                        result.snapshot?.output ??
                        `Filled ${result.fields.length} browser field(s)`,
                    data: {
                        ...(result.target ? { target: result.target } : {}),
                        ...(result.open ? { open: result.open } : {}),
                        fields: result.fields,
                        ...(result.submit ? { submit: result.submit } : {}),
                        ...(result.snapshot ? { snapshot: result.snapshot } : {}),
                        ...(result.screenshot
                            ? { screenshot: result.screenshot }
                            : {}),
                    },
                };

                const provider =
                    result.snapshot?.provider ??
                    result.submit?.provider ??
                    result.fields.at(0)?.provider;
                if (provider) {
                    response.provider = provider;
                }
                if (result.screenshot) {
                    response.artifactPath = result.screenshot.filePath;
                }

                return response;
            }
            case 'click': {
                const selector = readString(request.payload, 'selector');
                const newTab = readBoolean(request.payload, 'newTab');
                if (!selector) {
                    throw new Error('browser.click requires a selector');
                }

                const result = await this.browserTool.click(
                    {
                        selector,
                        ...(newTab !== undefined ? { newTab } : {}),
                    },
                    toolContext,
                );
                return {
                    tool: 'browser',
                    action: 'click',
                    provider: result.provider,
                    output: result.output,
                    data: result.data,
                };
            }
            case 'type': {
                const text = readString(request.payload, 'text') ?? '';
                const selector = readString(request.payload, 'selector');
                const clear = readBoolean(request.payload, 'clear');
                if (!text) {
                    throw new Error('browser.type requires text');
                }

                const result = await this.browserTool.type(
                    {
                        text,
                        ...(selector ? { selector } : {}),
                        ...(clear !== undefined ? { clear } : {}),
                    },
                    toolContext,
                );
                return {
                    tool: 'browser',
                    action: 'type',
                    provider: result.provider,
                    output: result.output,
                    data: result.data,
                };
            }
            case 'screenshot': {
                const filePath =
                    readString(request.payload, 'filePath') ??
                    defaultArtifactPath('browser', 'png');
                const fullPage = readBoolean(request.payload, 'fullPage');
                const annotate = readBoolean(request.payload, 'annotate');
                const result = await this.browserTool.screenshot(
                    {
                        filePath,
                        ...(fullPage !== undefined ? { fullPage } : {}),
                        ...(annotate !== undefined ? { annotate } : {}),
                    },
                    toolContext,
                );
                return {
                    tool: 'browser',
                    action: 'screenshot',
                    provider: result.provider,
                    output: result.output,
                    data: result.data,
                    artifactPath: result.filePath,
                };
            }
            default:
                throw new Error(`Unsupported hosted browser action: ${request.action}`);
        }
    }

    private async executeScreenAction(
        request: HostedActionRequest,
        context: HostedActionContext,
    ): Promise<HostedActionExecutionResult> {
        const toolContext = {
            triggeredBy: context.agent,
            ...(context.chatId ? { chatId: context.chatId } : {}),
        };

        switch (request.action) {
            case 'capture': {
                const filePath =
                    readString(request.payload, 'filePath') ??
                    defaultArtifactPath('screen', 'png');
                const app = readString(request.payload, 'app');
                const mode = readString(request.payload, 'mode');
                const windowTitle = readString(request.payload, 'windowTitle');
                const windowId = readNumber(request.payload, 'windowId');
                const screenIndex = readNumber(request.payload, 'screenIndex');
                const result = await this.screenTool.capture(
                    {
                        filePath,
                        ...(app ? { app } : {}),
                        ...(mode
                            ? {
                                mode: mode as 'screen' | 'window' | 'frontmost',
                            }
                            : {}),
                        ...(windowTitle ? { windowTitle } : {}),
                        ...(windowId !== undefined ? { windowId } : {}),
                        ...(screenIndex !== undefined ? { screenIndex } : {}),
                    },
                    toolContext,
                );
                return {
                    tool: 'screen',
                    action: 'capture',
                    provider: result.provider,
                    output: result.output ?? `Captured screen to ${result.filePath}`,
                    data: result.data,
                    artifactPath: result.filePath,
                };
            }
            case 'see': {
                const pathValue =
                    readString(request.payload, 'path') ??
                    defaultArtifactPath('see', 'png');
                const app = readString(request.payload, 'app');
                const mode = readString(request.payload, 'mode');
                const windowTitle = readString(request.payload, 'windowTitle');
                const windowId = readNumber(request.payload, 'windowId');
                const screenIndex = readNumber(request.payload, 'screenIndex');
                const annotate = readBoolean(request.payload, 'annotate');
                const analyze = readString(request.payload, 'analyze');
                const result = await this.screenTool.see(
                    {
                        path: pathValue,
                        ...(app ? { app } : {}),
                        ...(mode
                            ? {
                                mode: mode as 'screen' | 'window' | 'frontmost',
                            }
                            : {}),
                        ...(windowTitle ? { windowTitle } : {}),
                        ...(windowId !== undefined ? { windowId } : {}),
                        ...(screenIndex !== undefined ? { screenIndex } : {}),
                        ...(annotate !== undefined ? { annotate } : {}),
                        ...(analyze ? { analyze } : {}),
                    },
                    toolContext,
                );
                return {
                    tool: 'screen',
                    action: 'see',
                    provider: result.provider,
                    output: result.output,
                    data: result.data,
                    artifactPath: pathValue,
                };
            }
            case 'ocr': {
                const filePath = readString(request.payload, 'filePath');
                const app = readString(request.payload, 'app');
                const mode = readString(request.payload, 'mode');
                const windowTitle = readString(request.payload, 'windowTitle');
                const windowId = readNumber(request.payload, 'windowId');
                const screenIndex = readNumber(request.payload, 'screenIndex');
                const retina = readBoolean(request.payload, 'retina');
                const languages = readStringArray(request.payload, 'languages');
                const result = await this.screenTool.ocr(
                    {
                        ...(filePath ? { filePath } : {}),
                        ...(app ? { app } : {}),
                        ...(mode
                            ? {
                                mode: mode as 'screen' | 'window' | 'frontmost',
                            }
                            : {}),
                        ...(windowTitle ? { windowTitle } : {}),
                        ...(windowId !== undefined ? { windowId } : {}),
                        ...(screenIndex !== undefined ? { screenIndex } : {}),
                        ...(retina !== undefined ? { retina } : {}),
                        ...(languages ? { languages } : {}),
                    },
                    toolContext,
                );
                return {
                    tool: 'screen',
                    action: 'ocr',
                    output: result.output,
                    data: result.data,
                    artifactPath: result.filePath,
                    ...(result.captureProvider
                        ? { provider: result.captureProvider }
                        : {}),
                };
            }
            case 'frontmost_app': {
                const result = await this.screenTool.frontmostApp(toolContext);
                return {
                    tool: 'screen',
                    action: 'frontmost_app',
                    provider: result.provider,
                    output: result.output,
                    data: result.data,
                };
            }
            case 'open_app': {
                const app = readString(request.payload, 'app');
                if (!app) {
                    throw new Error('screen.open_app requires an app name');
                }

                const result = await this.screenTool.openApp(
                    { app },
                    toolContext,
                );
                return {
                    tool: 'screen',
                    action: 'open_app',
                    provider: result.provider,
                    output: result.output,
                    data: result.data,
                };
            }
            case 'activate_app': {
                const app = readString(request.payload, 'app');
                if (!app) {
                    throw new Error('screen.activate_app requires an app name');
                }

                const result = await this.screenTool.activateApp(
                    { app },
                    toolContext,
                );
                return {
                    tool: 'screen',
                    action: 'activate_app',
                    provider: result.provider,
                    output: result.output,
                    data: result.data,
                };
            }
            case 'inspect_app': {
                const app = readString(request.payload, 'app');
                if (!app) {
                    throw new Error('screen.inspect_app requires an app name');
                }

                const filePath = readString(request.payload, 'filePath');
                const waitMs = readNumber(request.payload, 'waitMs');
                const retina = readBoolean(request.payload, 'retina');
                const languages = readStringArray(request.payload, 'languages');
                const launchIfNeeded = readBoolean(
                    request.payload,
                    'launchIfNeeded',
                );
                const result = await this.screenTool.inspectApp(
                    {
                        app,
                        ...(filePath ? { filePath } : {}),
                        ...(waitMs !== undefined ? { waitMs } : {}),
                        ...(retina !== undefined ? { retina } : {}),
                        ...(languages ? { languages } : {}),
                        ...(launchIfNeeded !== undefined
                            ? { launchIfNeeded }
                            : {}),
                    },
                    toolContext,
                );

                return {
                    tool: 'screen',
                    action: 'inspect_app',
                    provider: result.capture.provider,
                    output: `Inspected ${result.appName}\n\n${truncateForPrompt(result.ocr.output, 1_500)}`,
                    data: {
                        appName: result.appName,
                        ...(result.frontmostApp
                            ? { frontmostApp: result.frontmostApp }
                            : {}),
                        capture: result.capture,
                        ocr: result.ocr,
                    },
                    artifactPath: result.capture.filePath,
                };
            }
            case 'click': {
                const query = readString(request.payload, 'query');
                const elementId = readString(request.payload, 'elementId');
                const coords = readString(request.payload, 'coords');
                const app = readString(request.payload, 'app');
                const windowTitle = readString(request.payload, 'windowTitle');
                const windowId = readNumber(request.payload, 'windowId');
                const snapshotId = readString(request.payload, 'snapshotId');
                const double = readBoolean(request.payload, 'double');
                const right = readBoolean(request.payload, 'right');
                const result = await this.screenTool.click(
                    {
                        ...(query ? { query } : {}),
                        ...(elementId ? { elementId } : {}),
                        ...(coords ? { coords } : {}),
                        ...(app ? { app } : {}),
                        ...(windowTitle ? { windowTitle } : {}),
                        ...(windowId !== undefined ? { windowId } : {}),
                        ...(snapshotId ? { snapshotId } : {}),
                        ...(double !== undefined ? { double } : {}),
                        ...(right !== undefined ? { right } : {}),
                    },
                    toolContext,
                );
                return {
                    tool: 'screen',
                    action: 'click',
                    provider: result.provider,
                    output: result.output,
                    data: result.data,
                };
            }
            case 'type': {
                const text = readString(request.payload, 'text') ?? '';
                const app = readString(request.payload, 'app');
                const windowTitle = readString(request.payload, 'windowTitle');
                const windowId = readNumber(request.payload, 'windowId');
                const snapshotId = readString(request.payload, 'snapshotId');
                const clear = readBoolean(request.payload, 'clear');
                const pressReturn = readBoolean(request.payload, 'pressReturn');
                if (!text) {
                    throw new Error('screen.type requires text');
                }

                const result = await this.screenTool.type(
                    {
                        text,
                        ...(app ? { app } : {}),
                        ...(windowTitle ? { windowTitle } : {}),
                        ...(windowId !== undefined ? { windowId } : {}),
                        ...(snapshotId ? { snapshotId } : {}),
                        ...(clear !== undefined ? { clear } : {}),
                        ...(pressReturn !== undefined ? { pressReturn } : {}),
                    },
                    toolContext,
                );
                return {
                    tool: 'screen',
                    action: 'type',
                    provider: result.provider,
                    output: result.output,
                    data: result.data,
                };
            }
            case 'press': {
                const keys = readStringArray(request.payload, 'keys');
                const app = readString(request.payload, 'app');
                const windowTitle = readString(request.payload, 'windowTitle');
                const windowId = readNumber(request.payload, 'windowId');
                const snapshotId = readString(request.payload, 'snapshotId');
                const count = readNumber(request.payload, 'count');
                if (!keys) {
                    throw new Error('screen.press requires a keys array');
                }

                const result = await this.screenTool.press(
                    {
                        keys,
                        ...(app ? { app } : {}),
                        ...(windowTitle ? { windowTitle } : {}),
                        ...(windowId !== undefined ? { windowId } : {}),
                        ...(snapshotId ? { snapshotId } : {}),
                        ...(count !== undefined ? { count } : {}),
                    },
                    toolContext,
                );
                return {
                    tool: 'screen',
                    action: 'press',
                    provider: result.provider,
                    output: result.output,
                    data: result.data,
                };
            }
            default:
                throw new Error(`Unsupported hosted screen action: ${request.action}`);
        }
    }

    logServedAction(
        context: HostedActionContext,
        result: HostedActionExecutionResult,
    ): void {
        this.logger.info(
            {
                runId: context.runId,
                agent: context.agent,
                tool: result.tool,
                action: result.action,
                provider: result.provider,
                channel: context.channel,
                chatId: context.chatId,
            },
            'Served hosted browser/screen action to agent',
        );
    }
}
