import { test } from 'node:test';
import assert from 'node:assert/strict';

import { journeyOrder, journeySegments } from '../../src/js/journey/journey-order.js';

function memory(id, date, lat, lng, createdAt = '2025-01-01T00:00:00.000Z') {
  return { id, title: id, date, lat, lng, createdAt, tags: [], photoIds: [] };
}

test('orders by date ascending', () => {
  const ordered = journeyOrder([
    memory('c', '2025-03-04', 1, 1),
    memory('a', '2025-01-04', 2, 2),
    memory('b', '2025-02-04', 3, 3)
  ]);

  assert.deepEqual(
    ordered.map((m) => m.id),
    ['a', 'b', 'c']
  );
});

test('breaks a date tie by createdAt ascending', () => {
  const ordered = journeyOrder([
    memory('later', '2025-03-04', 1, 1, '2025-06-02T00:00:00.000Z'),
    memory('earlier', '2025-03-04', 2, 2, '2025-06-01T00:00:00.000Z')
  ]);

  assert.deepEqual(
    ordered.map((m) => m.id),
    ['earlier', 'later']
  );
});

test('orders oldest first, the opposite of the sidebar list', () => {
  const ordered = journeyOrder([memory('new', '2025-12-31', 1, 1), memory('old', '2019-01-01', 2, 2)]);

  assert.equal(ordered[0].id, 'old');
});

test('orders across year boundaries', () => {
  const ordered = journeyOrder([
    memory('b', '2025-01-01', 1, 1),
    memory('a', '2024-12-31', 2, 2),
    memory('c', '2025-01-02', 3, 3)
  ]);

  assert.deepEqual(
    ordered.map((m) => m.id),
    ['a', 'b', 'c']
  );
});

test('does not mutate the array it is given', () => {
  const input = [memory('c', '2025-03-04', 1, 1), memory('a', '2025-01-04', 2, 2)];
  const before = input.map((m) => m.id);

  journeyOrder(input);

  assert.deepEqual(
    input.map((m) => m.id),
    before
  );
});

test('drops memories without usable coordinates', () => {
  const ordered = journeyOrder([
    memory('ok', '2025-01-01', 1, 1),
    memory('noLat', '2025-01-02', null, 1),
    memory('noLng', '2025-01-03', 1, undefined),
    memory('nan', '2025-01-04', Number.NaN, 1),
    { id: 'bare', date: '2025-01-05' }
  ]);

  assert.deepEqual(
    ordered.map((m) => m.id),
    ['ok']
  );
});

test('survives input that is not an array', () => {
  for (const value of [null, undefined, 'nope', 42]) {
    assert.deepEqual(journeyOrder(value), []);
  }
});

test('handles an empty list and a single memory', () => {
  assert.deepEqual(journeyOrder([]), []);
  assert.equal(journeyOrder([memory('only', '2025-01-01', 1, 1)]).length, 1);
});

test('one segment joins each consecutive pair', () => {
  const ordered = journeyOrder([
    memory('a', '2025-01-01', 0, 0),
    memory('b', '2025-01-02', 1, 1),
    memory('c', '2025-01-03', 2, 2)
  ]);

  const segments = journeySegments(ordered);

  assert.equal(segments.length, 2);
  assert.deepEqual(
    segments.map((s) => [s.from.id, s.to.id]),
    [
      ['a', 'b'],
      ['b', 'c']
    ]
  );
});

/* A pair at the same spot has nothing to draw: a zero-length polyline renders as a stray
   dot and would still collect a direction chevron. */
test('consecutive memories at identical coordinates produce no segment', () => {
  const ordered = journeyOrder([
    memory('a', '2025-01-01', -1.2921, 36.8219),
    memory('b', '2025-01-02', -1.2921, 36.8219)
  ]);

  assert.deepEqual(journeySegments(ordered), []);
});

test('only the identical pair is dropped, not its neighbours', () => {
  const ordered = journeyOrder([
    memory('a', '2025-01-01', 0, 0),
    memory('b', '2025-01-02', 5, 5),
    memory('c', '2025-01-03', 5, 5),
    memory('d', '2025-01-04', 9, 9)
  ]);

  const segments = journeySegments(ordered);

  assert.deepEqual(
    segments.map((s) => [s.from.id, s.to.id]),
    [
      ['a', 'b'],
      ['c', 'd']
    ]
  );
});

/* Dropping a segment must not renumber the stops: step 3 is still the third memory even
   when nothing is drawn into it. */
test('segment indices stay those of the ordered list', () => {
  const ordered = journeyOrder([
    memory('a', '2025-01-01', 0, 0),
    memory('b', '2025-01-02', 5, 5),
    memory('c', '2025-01-03', 5, 5),
    memory('d', '2025-01-04', 9, 9)
  ]);

  assert.deepEqual(
    journeySegments(ordered).map((s) => [s.fromIndex, s.toIndex]),
    [
      [0, 1],
      [2, 3]
    ]
  );
});

test('a near-identical coordinate still makes a segment', () => {
  const ordered = journeyOrder([
    memory('a', '2025-01-01', -1.2921, 36.8219),
    memory('b', '2025-01-02', -1.292101, 36.8219)
  ]);

  assert.equal(journeySegments(ordered).length, 1);
});

test('fewer than two stops gives no segments', () => {
  assert.deepEqual(journeySegments([]), []);
  assert.deepEqual(journeySegments([memory('only', '2025-01-01', 1, 1)]), []);
  assert.deepEqual(journeySegments(null), []);
});
