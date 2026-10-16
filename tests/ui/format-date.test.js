import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatLongDate, formatMemoryDate } from '../../src/js/ui/format-date.js';

function withTimezone(zone, run) {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    run();
  } finally {
    process.env.TZ = previous;
  }
}

test('formats a date as day, short month, year', () => {
  assert.equal(formatMemoryDate('2025-03-04'), '4 Mar 2025');
});

test('does not pad the day', () => {
  assert.equal(formatMemoryDate('2025-01-01'), '1 Jan 2025');
  assert.equal(formatMemoryDate('2025-01-09'), '9 Jan 2025');
});

test('formats the end of the year', () => {
  assert.equal(formatMemoryDate('2025-12-31'), '31 Dec 2025');
});

test('formats a leap day', () => {
  assert.equal(formatMemoryDate('2024-02-29'), '29 Feb 2024');
});

/* The failure this guards: new Date('2025-03-04') is midnight UTC, which is still
   3 March for anyone behind UTC, so a naive format would show the wrong day. */
test('keeps the stored day in a timezone behind UTC', () => {
  withTimezone('Pacific/Niue', () => {
    assert.equal(formatMemoryDate('2025-03-04'), '4 Mar 2025');
  });

  withTimezone('America/Los_Angeles', () => {
    assert.equal(formatMemoryDate('2025-03-04'), '4 Mar 2025');
    assert.equal(formatMemoryDate('2025-01-01'), '1 Jan 2025');
  });
});

test('keeps the stored day in a timezone ahead of UTC', () => {
  withTimezone('Africa/Nairobi', () => {
    assert.equal(formatMemoryDate('2025-03-04'), '4 Mar 2025');
  });

  withTimezone('Pacific/Kiritimati', () => {
    assert.equal(formatMemoryDate('2025-03-04'), '4 Mar 2025');
    assert.equal(formatMemoryDate('2025-12-31'), '31 Dec 2025');
  });
});

test('gives the same answer in every timezone', () => {
  const zones = ['UTC', 'Pacific/Niue', 'America/Los_Angeles', 'Africa/Nairobi', 'Pacific/Kiritimati'];
  const results = new Set();

  for (const zone of zones) {
    withTimezone(zone, () => {
      results.add(formatMemoryDate('2025-06-15'));
    });
  }

  assert.deepEqual([...results], ['15 Jun 2025']);
});

test('returns an empty string for values that are not date-only strings', () => {
  for (const value of ['', '2025-3-4', '04/03/2025', '2025-03-04T00:00:00Z', 'nope', null, undefined, 42, {}]) {
    assert.equal(formatMemoryDate(value), '');
  }
});

/* The detail view's heading date. Same date-only handling as above, which is the whole point
   of it going through the same function: a second formatter written beside it would be a
   second chance to reach for the Date constructor. */
test('formats a long date with the weekday and the full month', () => {
  assert.equal(formatLongDate('2025-03-04'), 'Tuesday, 4 March 2025');
  assert.equal(formatLongDate('2025-01-01'), 'Wednesday, 1 January 2025');
  assert.equal(formatLongDate('2024-02-29'), 'Thursday, 29 February 2024');
});

test('the long format keeps the stored day in every timezone', () => {
  const zones = ['UTC', 'Pacific/Niue', 'America/Los_Angeles', 'Africa/Nairobi', 'Pacific/Kiritimati'];
  const results = new Set();

  for (const zone of zones) {
    withTimezone(zone, () => {
      results.add(formatLongDate('2025-03-04'));
    });
  }

  assert.deepEqual([...results], ['Tuesday, 4 March 2025']);
});

/* The first day of a year is where a drifting format shows the worst of itself: behind UTC
   it would read as the last day of the year before, so the detail view and the year heading
   above the card would disagree. */
test('the long format does not drift across a year boundary', () => {
  withTimezone('Pacific/Niue', () => {
    assert.equal(formatLongDate('2025-01-01'), 'Wednesday, 1 January 2025');
    assert.equal(formatLongDate('2024-12-31'), 'Tuesday, 31 December 2024');
  });
});

test('the long format rejects the same values the short one does', () => {
  for (const value of ['', '2025-3-4', '04/03/2025', '2025-03-04T00:00:00Z', 'nope', null, undefined, 42, {}]) {
    assert.equal(formatLongDate(value), '');
  }
});
