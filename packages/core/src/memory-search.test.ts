import assert from 'node:assert/strict';
import test from 'node:test';

import {
    MEMORY_SEARCH_BRIDGE_PREFIX,
    MemorySearchService,
} from './memory-search.js';
import { buildLocalDayRange } from './workspace-memory-date.js';

const memorySearchService = new MemorySearchService({} as never);

test('parseCommand uses local calendar day windows for date filters', () => {
    const parsed = memorySearchService.parseCommand(
        '/search --date 2026-03-22 release notes',
    );

    assert.ok(parsed);
    assert.equal('error' in parsed, false);
    if (!parsed || 'error' in parsed) {
        return;
    }

    assert.equal(parsed.request.dateKey, '2026-03-22');
    assert.deepEqual(
        {
            from: parsed.request.from,
            to: parsed.request.to,
        },
        buildLocalDayRange('2026-03-22'),
    );
});

test('parseCommand rejects impossible calendar dates', () => {
    const parsed = memorySearchService.parseCommand(
        '/search --date 2026-02-31 release notes',
    );

    assert.ok(parsed);
    assert.equal(parsed?.kind, 'search');
    assert.equal('error' in parsed, true);
    if (!parsed || !('error' in parsed)) {
        return;
    }

    assert.equal(parsed.error, 'Date must use YYYY-MM-DD format.');
});

test('parseBridgeRequest uses local calendar day windows for date filters', () => {
    const parsed = memorySearchService.parseBridgeRequest(
        `${MEMORY_SEARCH_BRIDGE_PREFIX} {"query":"release notes","date":"2026-03-22"}`,
    );

    assert.deepEqual(
        parsed && {
            dateKey: parsed.dateKey,
            from: parsed.from,
            to: parsed.to,
            filepathLike: parsed.filepathLike,
        },
        {
            dateKey: '2026-03-22',
            ...buildLocalDayRange('2026-03-22'),
            filepathLike: '%/2026-03-22.md',
        },
    );
});
