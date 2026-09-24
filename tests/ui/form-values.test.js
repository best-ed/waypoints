import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseTagInput, todayLocalDate } from '../../src/js/ui/form-values.js';

/* Node re-reads process.env.TZ when Date methods run, so a zone can be pinned per test.
   Always restore it, since the setting is process wide. */
function withTimezone(zone, run) {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    run();
  } finally {
    process.env.TZ = previous;
  }
}

test('formats a date as YYYY-MM-DD', () => {
  withTimezone('UTC', () => {
    assert.equal(todayLocalDate(new Date('2025-03-04T12:00:00Z')), '2025-03-04');
  });
});

test('pads single digit months and days', () => {
  withTimezone('UTC', () => {
    assert.equal(todayLocalDate(new Date('2025-01-02T12:00:00Z')), '2025-01-02');
    assert.equal(todayLocalDate(new Date('2025-12-31T12:00:00Z')), '2025-12-31');
  });
});

/* The bug this guards: at 00:30 in Nairobi the UTC clock still reads the previous day,
   so toISOString().slice(0, 10) would date the memory one day early. */
test('uses the local date, not the UTC date, ahead of UTC', () => {
  withTimezone('Africa/Nairobi', () => {
    const justAfterLocalMidnight = new Date('2025-03-04T21:30:00Z');

    assert.equal(todayLocalDate(justAfterLocalMidnight), '2025-03-05');
    assert.equal(justAfterLocalMidnight.toISOString().slice(0, 10), '2025-03-04');
    assert.notEqual(todayLocalDate(justAfterLocalMidnight), justAfterLocalMidnight.toISOString().slice(0, 10));
  });
});

test('uses the local date, not the UTC date, behind UTC', () => {
  withTimezone('Pacific/Niue', () => {
    const lateLocalEvening = new Date('2025-03-05T08:00:00Z');

    assert.equal(todayLocalDate(lateLocalEvening), '2025-03-04');
    assert.equal(lateLocalEvening.toISOString().slice(0, 10), '2025-03-05');
  });
});

test('crosses the year boundary by local time', () => {
  withTimezone('Africa/Nairobi', () => {
    assert.equal(todayLocalDate(new Date('2024-12-31T21:30:00Z')), '2025-01-01');
  });
});

test('defaults to the current moment', () => {
  const now = new Date();
  const expected = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('-');

  assert.equal(todayLocalDate(), expected);
});

test('splits tags on commas and trims them', () => {
  assert.deepEqual(parseTagInput('trail, view, sunset'), ['trail', 'view', 'sunset']);
  assert.deepEqual(parseTagInput('  trail  ,view  '), ['trail', 'view']);
});

test('drops empty segments', () => {
  assert.deepEqual(parseTagInput('trail,,view,'), ['trail', 'view']);
  assert.deepEqual(parseTagInput(',,,'), []);
  assert.deepEqual(parseTagInput('   '), []);
  assert.deepEqual(parseTagInput(''), []);
});

test('handles a single tag with no commas', () => {
  assert.deepEqual(parseTagInput('trail'), ['trail']);
});

test('leaves case and duplicates alone for the store to normalize', () => {
  assert.deepEqual(parseTagInput('Trail, TRAIL'), ['Trail', 'TRAIL']);
});

test('keeps spaces inside a tag', () => {
  assert.deepEqual(parseTagInput('road trip, rift valley'), ['road trip', 'rift valley']);
});

test('returns an empty list for non-string input', () => {
  for (const value of [null, undefined, 42, [], {}]) {
    assert.deepEqual(parseTagInput(value), []);
  }
});
