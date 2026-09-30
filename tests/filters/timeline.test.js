import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  toDayNumber,
  fromDayNumber,
  timelineBuckets,
  distinctDateCount,
  MONTHLY_SPAN_LIMIT
} from '../../src/js/filters/timeline.js';

function withTimezone(zone, run) {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    run();
  } finally {
    process.env.TZ = previous;
  }
}

function memory(date, overrides = {}) {
  return { id: date, title: 'x', note: '', placeName: '', tags: [], date, ...overrides };
}

test('day zero is the epoch', () => {
  assert.equal(toDayNumber('1970-01-01'), 0);
  assert.equal(fromDayNumber(0), '1970-01-01');
});

test('counts days forward and backward from the epoch', () => {
  assert.equal(toDayNumber('1970-01-02'), 1);
  assert.equal(toDayNumber('1969-12-31'), -1);
  assert.equal(fromDayNumber(-1), '1969-12-31');
});

test('round trips an ordinary date', () => {
  for (const date of ['2025-03-04', '2000-01-01', '1999-12-31', '2038-01-19']) {
    assert.equal(fromDayNumber(toDayNumber(date)), date, date + ' survives the round trip');
  }
});

test('round trips across leap days', () => {
  for (const date of ['2024-02-28', '2024-02-29', '2024-03-01', '2000-02-29', '2100-02-28']) {
    assert.equal(fromDayNumber(toDayNumber(date)), date);
  }
});

test('a leap year has 366 days between new years', () => {
  assert.equal(toDayNumber('2025-01-01') - toDayNumber('2024-01-01'), 366);
  assert.equal(toDayNumber('2024-01-01') - toDayNumber('2023-01-01'), 365);
});

test('round trips across year boundaries', () => {
  assert.equal(toDayNumber('2025-01-01') - toDayNumber('2024-12-31'), 1);
  assert.equal(fromDayNumber(toDayNumber('2024-12-31') + 1), '2025-01-01');
});

/* The failure this guards: parsing "2025-03-04" with the Date constructor gives midnight
   UTC, which is still 3 March for anyone behind UTC. Built from parts, it cannot drift. */
test('gives the same day number in a timezone behind UTC', () => {
  const expected = toDayNumber('2025-03-04');

  withTimezone('Pacific/Niue', () => {
    assert.equal(toDayNumber('2025-03-04'), expected);
    assert.equal(fromDayNumber(expected), '2025-03-04');
  });

  withTimezone('America/Los_Angeles', () => {
    assert.equal(toDayNumber('2025-03-04'), expected);
    assert.equal(fromDayNumber(expected), '2025-03-04');
  });
});

test('gives the same day number in a timezone ahead of UTC', () => {
  const expected = toDayNumber('2025-03-04');

  withTimezone('Africa/Nairobi', () => {
    assert.equal(toDayNumber('2025-03-04'), expected);
    assert.equal(fromDayNumber(expected), '2025-03-04');
  });

  withTimezone('Pacific/Kiritimati', () => {
    assert.equal(toDayNumber('2025-03-04'), expected);
    assert.equal(fromDayNumber(expected), '2025-03-04');
  });
});

test('round trips every timezone the same way across a leap day', () => {
  for (const zone of ['UTC', 'Pacific/Niue', 'America/Los_Angeles', 'Africa/Nairobi', 'Pacific/Kiritimati']) {
    withTimezone(zone, () => {
      assert.equal(fromDayNumber(toDayNumber('2024-02-29')), '2024-02-29', zone);
      assert.equal(fromDayNumber(toDayNumber('2025-01-01')), '2025-01-01', zone);
    });
  }
});

test('rejects values that are not date-only strings', () => {
  for (const value of ['', '2025-3-4', '2025-03-04T00:00:00Z', 'nope', null, undefined, 42]) {
    assert.equal(toDayNumber(value), null);
  }
});

test('fromDayNumber rejects values that are not numbers', () => {
  for (const value of [null, undefined, NaN, Infinity, '100']) {
    assert.equal(fromDayNumber(value), null);
  }
});

test('buckets a short span by month', () => {
  const result = timelineBuckets([memory('2025-01-15'), memory('2025-03-04')], {});

  assert.equal(result.unit, 'month');
  assert.deepEqual(result.buckets.map((b) => b.key), ['2025-01', '2025-02', '2025-03']);
});

/* Empty buckets stay in, so a quiet month shows as a gap rather than being closed up. */
test('includes empty buckets inside the span', () => {
  const result = timelineBuckets([memory('2025-01-15'), memory('2025-04-04')], {});

  assert.deepEqual(result.buckets.map((b) => b.count), [1, 0, 0, 1]);
});

test('counts several memories in the same bucket', () => {
  const result = timelineBuckets(
    [memory('2025-01-05'), memory('2025-01-15'), memory('2025-01-25')],
    {}
  );

  assert.equal(result.buckets.length, 1);
  assert.equal(result.buckets[0].count, 3);
});

test('labels monthly buckets with a short month and year', () => {
  const result = timelineBuckets([memory('2025-01-15'), memory('2025-02-04')], {});

  assert.deepEqual(result.buckets.map((b) => b.label), ['Jan 2025', 'Feb 2025']);
});

test('gives each monthly bucket the right first and last day', () => {
  const result = timelineBuckets([memory('2024-01-15'), memory('2024-02-04')], {});

  assert.equal(result.buckets[0].start, '2024-01-01');
  assert.equal(result.buckets[0].end, '2024-01-31');
  assert.equal(result.buckets[1].end, '2024-02-29', 'February in a leap year');
});

test('stays monthly exactly at the span limit', () => {
  const result = timelineBuckets([memory('2023-01-15'), memory('2025-12-04')], {});

  assert.equal(result.unit, 'month');
  assert.equal(result.buckets.length, MONTHLY_SPAN_LIMIT);
});

test('switches to years one month past the limit', () => {
  const result = timelineBuckets([memory('2022-12-15'), memory('2025-12-04')], {});

  assert.equal(result.unit, 'year');
  assert.deepEqual(result.buckets.map((b) => b.key), ['2022', '2023', '2024', '2025']);
});

test('includes empty years in a yearly span', () => {
  const result = timelineBuckets([memory('2019-01-15'), memory('2025-03-04')], {});

  assert.equal(result.unit, 'year');
  assert.equal(result.buckets.length, 7);
  assert.deepEqual(result.buckets.map((b) => b.count), [1, 0, 0, 0, 0, 0, 1]);
});

test('a single memory gives one bucket', () => {
  const result = timelineBuckets([memory('2025-03-04')], {});

  assert.equal(result.buckets.length, 1);
  assert.equal(result.buckets[0].count, 1);
  assert.equal(result.first, '2025-03-04');
  assert.equal(result.last, '2025-03-04');
});

test('returns nothing for an empty library', () => {
  const result = timelineBuckets([], {});

  assert.deepEqual(result.buckets, []);
  assert.equal(result.first, null);
  assert.equal(result.last, null);
});

/* The buckets show what the range handles could select, so the range itself must not
   narrow them, or dragging a handle inwards would shrink the histogram under it. */
test('ignores the date filter but honours the others', () => {
  const library = [
    memory('2025-01-15', { tags: ['trail'] }),
    memory('2025-02-15', { tags: ['food'] }),
    memory('2025-03-15', { tags: ['trail'] })
  ];

  const ranged = timelineBuckets(library, { from: '2025-02-01', to: '2025-02-28' });
  assert.equal(ranged.buckets.length, 3, 'the range does not shrink the span');

  const tagged = timelineBuckets(library, { tags: ['trail'] });
  assert.deepEqual(tagged.buckets.map((b) => b.count), [1, 0, 1]);
});

test('skips memories without a usable date', () => {
  const result = timelineBuckets([memory('2025-01-15'), memory(''), memory(null)], {});

  assert.equal(result.buckets.length, 1);
  assert.equal(result.buckets[0].count, 1);
});

test('counts distinct dates', () => {
  assert.equal(distinctDateCount([memory('2025-01-15'), memory('2025-01-15')]), 1);
  assert.equal(distinctDateCount([memory('2025-01-15'), memory('2025-02-15')]), 2);
  assert.equal(distinctDateCount([]), 0);
  assert.equal(distinctDateCount([memory('')]), 0);
  assert.equal(distinctDateCount(null), 0);
});
