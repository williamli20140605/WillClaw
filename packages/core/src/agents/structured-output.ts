function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

const ANSI_ESCAPE_PATTERN =
    // eslint-disable-next-line no-control-regex
    /\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

const IGNORED_GENERIC_KEYS = new Set([
    'id',
    'ids',
    'type',
    'types',
    'timestamp',
    'time',
    'session',
    'sessionID',
    'messageID',
    'snapshot',
    'reason',
    'metadata',
    'tokens',
    'cache',
    'cost',
    'usage',
    'start',
    'end',
]);

const IGNORED_EVENT_TYPES = new Set([
    'step_start',
    'step-start',
    'step_finish',
    'step-finish',
    'status',
    'debug',
    'trace',
    'metrics',
    'usage',
]);

export interface NormalizedCliOutput {
    content: string;
    metadata: {
        parser: 'plain_text' | 'structured_json' | 'linewise_json' | 'event_stream';
        eventTypes?: string[];
        extractedTextParts: number;
    };
}

function stripAnsi(value: string): string {
    return value.replace(ANSI_ESCAPE_PATTERN, '');
}

function normalizeWhitespace(value: string): string {
    return stripAnsi(value)
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function dedupe(parts: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const part of parts) {
        const normalized = normalizeWhitespace(part);
        if (!normalized || seen.has(normalized)) {
            continue;
        }

        seen.add(normalized);
        result.push(normalized);
    }

    return result;
}

function collectText(
    value: unknown,
    parts: string[],
    depth = 0,
    visited = new WeakSet<object>(),
): void {
    if (depth > 8 || value == null) {
        return;
    }

    if (typeof value === 'string') {
        const trimmed = normalizeWhitespace(value);
        if (trimmed) {
            parts.push(trimmed);
        }
        return;
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            collectText(item, parts, depth + 1, visited);
        }
        return;
    }

    if (!isRecord(value)) {
        return;
    }

    if (visited.has(value)) {
        return;
    }

    visited.add(value);

    const preferredKeys = [
        'content',
        'text',
        'message',
        'messages',
        'response',
        'responses',
        'result',
        'results',
        'output',
        'outputs',
        'assistant',
        'candidates',
        'parts',
    ];
    const seen = new Set<string>();

    for (const key of preferredKeys) {
        if (key in value) {
            collectText(value[key], parts, depth + 1, visited);
            seen.add(key);
        }
    }

    for (const [key, nestedValue] of Object.entries(value)) {
        if (seen.has(key) || IGNORED_GENERIC_KEYS.has(key)) {
            continue;
        }

        collectText(nestedValue, parts, depth + 1, visited);
    }
}

function parseLinewiseJson(rawOutput: string): unknown[] {
    const parsed: unknown[] = [];

    for (const line of rawOutput.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
            continue;
        }

        try {
            parsed.push(JSON.parse(trimmed));
        } catch {
            continue;
        }
    }

    return parsed;
}

function extractPreferredText(value: unknown): string[] {
    const parts: string[] = [];
    collectText(value, parts);
    return dedupe(parts);
}

function collectEventText(event: unknown, parts: string[], eventTypes: Set<string>): void {
    if (!isRecord(event)) {
        return;
    }

    const eventType =
        typeof event.type === 'string'
            ? event.type
            : isRecord(event.part) && typeof event.part.type === 'string'
                ? event.part.type
                : null;

    if (eventType) {
        eventTypes.add(eventType);
    }

    if (eventType && IGNORED_EVENT_TYPES.has(eventType)) {
        return;
    }

    const part = isRecord(event.part) ? event.part : null;
    if (part && part.type === 'text' && typeof part.text === 'string') {
        parts.push(part.text);
        return;
    }

    if (typeof event.text === 'string') {
        parts.push(event.text);
        return;
    }

    const preferredPayloads = [
        event.content,
        event.message,
        event.response,
        event.result,
        event.output,
        part?.content,
        part?.message,
        part?.output,
    ];

    for (const payload of preferredPayloads) {
        const extracted = extractPreferredText(payload);
        if (extracted.length > 0) {
            parts.push(...extracted);
            return;
        }
    }
}

function tryExtractEventStream(rawOutput: string): NormalizedCliOutput | null {
    const parsedLines = parseLinewiseJson(rawOutput);
    if (parsedLines.length === 0) {
        return null;
    }

    const eventTypes = new Set<string>();
    const parts: string[] = [];

    for (const parsedLine of parsedLines) {
        collectEventText(parsedLine, parts, eventTypes);
    }

    const normalizedParts = dedupe(parts);
    if (normalizedParts.length === 0) {
        return null;
    }

    return {
        content: normalizedParts.join('\n\n'),
        metadata: {
            parser: 'event_stream',
            eventTypes: [...eventTypes],
            extractedTextParts: normalizedParts.length,
        },
    };
}

function tryExtractStructuredJson(rawOutput: string): NormalizedCliOutput | null {
    const trimmed = rawOutput.trim();
    if (!trimmed) {
        return null;
    }

    try {
        const parsed = JSON.parse(trimmed);
        const parts = extractPreferredText(parsed);
        if (parts.length === 0) {
            return null;
        }

        return {
            content: parts.join('\n\n'),
            metadata: {
                parser: 'structured_json',
                extractedTextParts: parts.length,
            },
        };
    } catch {
        return null;
    }
}

function tryExtractLinewiseJson(rawOutput: string): NormalizedCliOutput | null {
    const parsedLines = parseLinewiseJson(rawOutput);
    if (parsedLines.length === 0) {
        return null;
    }

    const parts = dedupe(parsedLines.flatMap((parsedLine) => extractPreferredText(parsedLine)));
    if (parts.length === 0) {
        return null;
    }

    return {
        content: parts.join('\n\n'),
        metadata: {
            parser: 'linewise_json',
            extractedTextParts: parts.length,
        },
    };
}

export function extractTextFromStructuredOutput(rawOutput: string): string {
    return normalizeCliAgentOutput(rawOutput, 'json').content;
}

export function normalizeCliAgentOutput(
    rawOutput: string,
    outputFormat: 'text' | 'json',
): NormalizedCliOutput {
    const normalizedPlainText = normalizeWhitespace(rawOutput);

    if (outputFormat === 'text') {
        return {
            content: normalizedPlainText,
            metadata: {
                parser: 'plain_text',
                extractedTextParts: normalizedPlainText ? 1 : 0,
            },
        };
    }

    const normalized =
        tryExtractStructuredJson(rawOutput) ??
        tryExtractEventStream(rawOutput) ??
        tryExtractLinewiseJson(rawOutput);

    if (normalized) {
        return normalized;
    }

    return {
        content: normalizedPlainText,
        metadata: {
            parser: 'plain_text',
            extractedTextParts: normalizedPlainText ? 1 : 0,
        },
    };
}
