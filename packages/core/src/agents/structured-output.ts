function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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
    const trimmed = value.trim();
    if (trimmed) {
      parts.push(trimmed);
    }
    return;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    parts.push(String(value));
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
    if (seen.has(key)) {
      continue;
    }

    collectText(nestedValue, parts, depth + 1, visited);
  }
}

function dedupe(parts: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const part of parts) {
    if (seen.has(part)) {
      continue;
    }

    seen.add(part);
    result.push(part);
  }

  return result;
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

export function extractTextFromStructuredOutput(rawOutput: string): string {
  const trimmed = rawOutput.trim();
  if (!trimmed) {
    return '';
  }

  const collected: string[] = [];

  try {
    collectText(JSON.parse(trimmed), collected);
  } catch {
    for (const parsedLine of parseLinewiseJson(trimmed)) {
      collectText(parsedLine, collected);
    }
  }

  const normalized = dedupe(collected)
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n\n');

  return normalized || trimmed;
}
