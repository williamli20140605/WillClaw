import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildLocalDayRange,
    formatLocalDateKey,
    isValidDateKey,
    resolveDateKey,
} from './workspace-memory-date.js';

test('isValidDateKey accepts real calendar dates and rejects invalid ones', () => {
    assert.equal(isValidDateKey('2026-03-22'), true);
    assert.equal(isValidDateKey('2026-02-29'), false);
    assert.equal(isValidDateKey('../2026-03-22'), false);
    assert.equal(isValidDateKey('2026-3-22'), false);
});

test('resolveDateKey normalizes string dates and rejects invalid path-like values', () => {
    assert.equal(resolveDateKey(' 2026-03-22 '), '2026-03-22');
    assert.throws(() => resolveDateKey('../../../tmp/pwn'), {
        message: 'Daily note date must use YYYY-MM-DD format.',
    });
});

test('formatLocalDateKey uses local calendar dates instead of UTC slices', () => {
    const localMidnight = new Date(2026, 2, 22, 0, 15, 0);
    assert.equal(formatLocalDateKey(localMidnight), '2026-03-22');
});

test('buildLocalDayRange returns a one-day ISO window based on local midnight', () => {
    const range = buildLocalDayRange('2026-03-22');
    const from = new Date(range.from);
    const to = new Date(range.to);

    assert.equal(to.getTime() > from.getTime(), true);
    assert.equal(from.getFullYear(), 2026);
    assert.equal(from.getMonth(), 2);
    assert.equal(from.getDate(), 22);
    assert.equal(to.getFullYear(), 2026);
    assert.equal(to.getMonth(), 2);
    assert.equal(to.getDate(), 23);
});
