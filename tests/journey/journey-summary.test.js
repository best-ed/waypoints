import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  journeySummary,
  formatJourneySummary,
  formatDistanceKm,
  formatMonthYear
} from '../../src/js/journey/journey-summary.js';

function memory(id, date, lat, lng, createdAt = '2025-01-01T00:00:00.000Z') {
  return { id, title: id, date, lat, lng, createdAt, tags: [], photoIds: [] };
}

const LONDON = [51.5074, -0.1278];
const NAIROBI = [-1.2921, 36.8219];
const PARIS = [48.8566, 2.3522];

test('an empty journey summarises to nothing', () => {
  assert.deepEqual(journeySummary([]), { distanceKm: 0, count: 0, first: null, last: null });
  assert.deepEqual(journeySummary(null), { distanceKm: 0, count: 0, first: null, last: null });
});

test('a single memory has a count but no distance', () => {
  const summary = journeySummary([memory('a', '2025-03-04', ...LONDON)]);

  assert.equal(summary.count, 1);
  assert.equal(summary.distanceKm, 0);
  assert.equal(summary.first, '2025-03-04');
  assert.equal(summary.last, '2025-03-04');
});

test('distance is the sum of the legs', () => {
  const summary = journeySummary([
    memory('a', '2025-01-01', ...LONDON),
    memory('b', '2025-01-02', ...PARIS),
    memory('c', '2025-01-03', ...NAIROBI)
  ]);

  assert.equal(summary.count, 3);
  /* London to Paris is about 344 km, Paris to Nairobi about 6485 km. */
  assert.ok(summary.distanceKm > 6700 && summary.distanceKm < 6900, summary.distanceKm + ' km');
});

test('first and last come from the chronological ends, not the input order', () => {
  const summary = journeySummary([
    memory('late', '2024-06-15', ...LONDON),
    memory('early', '2019-03-10', ...NAIROBI),
    memory('middle', '2021-06-01', ...PARIS)
  ]);

  assert.equal(summary.first, '2019-03-10');
  assert.equal(summary.last, '2024-06-15');
});

/* A pair at the same spot draws no segment, so it must not add distance either - the number
   has to agree with the line on the map. */
test('a repeated location adds no distance', () => {
  const summary = journeySummary([
    memory('a', '2025-01-01', ...NAIROBI),
    memory('b', '2025-01-02', ...NAIROBI),
    memory('c', '2025-01-03', ...NAIROBI)
  ]);

  assert.equal(summary.count, 3);
  assert.equal(summary.distanceKm, 0);
});

test('memories without coordinates are not counted', () => {
  const summary = journeySummary([
    memory('a', '2025-01-01', ...LONDON),
    memory('b', '2025-01-02', null, null)
  ]);

  assert.equal(summary.count, 1);
});

test('formats the summary line', () => {
  const line = formatJourneySummary({
    distanceKm: 1239.6,
    count: 12,
    first: '2019-03-10',
    last: '2024-06-15'
  });

  assert.equal(line, '1,240 km · 12 memories · Mar 2019 to Jun 2024');
});

test('a thousands separator appears in a long journey', () => {
  assert.equal(formatDistanceKm(24099.68), '24,100 km');
  assert.equal(formatDistanceKm(999), '999 km');
  assert.equal(formatDistanceKm(0), '0 km');
});

test('a nonsense distance formats as zero rather than NaN', () => {
  for (const value of [Number.NaN, null, undefined, Infinity, 'far']) {
    assert.equal(formatDistanceKm(value), '0 km');
  }
});

test('one memory reads in the singular', () => {
  const line = formatJourneySummary({ distanceKm: 0, count: 1, first: '2025-03-04', last: '2025-03-04' });

  assert.ok(line.includes('1 memory'), line);
  assert.ok(!line.includes('memories'), line);
});

/* "Mar 2019 to Mar 2019" says the same thing twice. */
test('a journey inside one month names it once', () => {
  const line = formatJourneySummary({ distanceKm: 629, count: 2, first: '2019-03-10', last: '2019-03-20' });

  assert.equal(line, '629 km · 2 memories · Mar 2019');
});

test('an empty summary formats to an empty string', () => {
  assert.equal(formatJourneySummary({ distanceKm: 0, count: 0, first: null, last: null }), '');
  assert.equal(formatJourneySummary(null), '');
});

test('formats a month and year', () => {
  assert.equal(formatMonthYear('2019-03-10'), 'Mar 2019');
  assert.equal(formatMonthYear('2024-06-15'), 'Jun 2024');
  assert.equal(formatMonthYear('2024-12-31'), 'Dec 2024');
});

/* The same drift this project guards everywhere: "2025-01-01" parsed as midnight UTC is
   31 December for anyone behind UTC, which would print the wrong month and year. */
test('a month and year do not drift by timezone', () => {
  const previous = process.env.TZ;

  try {
    for (const zone of ['UTC', 'Pacific/Niue', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
      process.env.TZ = zone;
      assert.equal(formatMonthYear('2025-01-01'), 'Jan 2025', zone);
      assert.equal(formatMonthYear('2024-12-31'), 'Dec 2024', zone);
    }
  } finally {
    process.env.TZ = previous;
  }
});

test('rejects a value that is not a date-only string', () => {
  for (const value of ['', '2025-3-4', '2025-03-04T00:00:00Z', 'nope', null, 42]) {
    assert.equal(formatMonthYear(value), '');
  }
});
