import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sortForList } from '../../src/js/ui/sort-for-list.js';

function memory(id, date, createdAt = '2025-05-01T10:00:00.000Z') {
  return { id, date, createdAt };
}

test('puts the newest date first', () => {
  const sorted = sortForList([
    memory('a', '2024-01-15'),
    memory('b', '2025-07-01'),
    memory('c', '2025-03-04')
  ]);

  assert.deepEqual(sorted.map((item) => item.id), ['b', 'c', 'a']);
});

test('breaks a date tie with the newest createdAt first', () => {
  const sorted = sortForList([
    memory('older', '2025-03-04', '2025-05-01T10:00:00.000Z'),
    memory('newer', '2025-03-04', '2025-05-01T12:00:00.000Z'),
    memory('newest', '2025-03-04', '2025-05-02T09:00:00.000Z')
  ]);

  assert.deepEqual(sorted.map((item) => item.id), ['newest', 'newer', 'older']);
});

test('orders by date before createdAt', () => {
  const sorted = sortForList([
    memory('recent-date-old-record', '2025-07-01', '2024-01-01T00:00:00.000Z'),
    memory('old-date-new-record', '2024-01-01', '2025-12-01T00:00:00.000Z')
  ]);

  assert.deepEqual(sorted.map((item) => item.id), ['recent-date-old-record', 'old-date-new-record']);
});

test('does not mutate the array it is given', () => {
  const input = [memory('a', '2024-01-15'), memory('b', '2025-07-01'), memory('c', '2025-03-04')];
  const before = input.map((item) => item.id);

  sortForList(input);

  assert.deepEqual(input.map((item) => item.id), before);
});

test('returns a new array, not the one passed in', () => {
  const input = [memory('a', '2025-01-01')];
  const sorted = sortForList(input);

  assert.notEqual(sorted, input);
  assert.equal(sorted.length, 1);
});

test('does not clone the memories themselves', () => {
  const input = [memory('a', '2025-01-01')];
  assert.equal(sortForList(input)[0], input[0]);
});

test('handles an empty list', () => {
  assert.deepEqual(sortForList([]), []);
});

test('handles a single memory', () => {
  const sorted = sortForList([memory('only', '2025-01-01')]);
  assert.deepEqual(sorted.map((item) => item.id), ['only']);
});

test('keeps a stable order for records identical on both keys', () => {
  const stamp = '2025-05-01T10:00:00.000Z';
  const input = [memory('first', '2025-03-04', stamp), memory('second', '2025-03-04', stamp)];

  assert.deepEqual(sortForList(input).map((item) => item.id), ['first', 'second']);
});

test('sorts dates across year boundaries', () => {
  const sorted = sortForList([
    memory('a', '2024-12-31'),
    memory('b', '2025-01-01'),
    memory('c', '2023-06-15')
  ]);

  assert.deepEqual(sorted.map((item) => item.id), ['b', 'a', 'c']);
});

test('gives the same answer whatever order it starts in', () => {
  const items = [
    memory('a', '2024-01-15', '2025-01-01T00:00:00.000Z'),
    memory('b', '2025-07-01', '2025-01-02T00:00:00.000Z'),
    memory('c', '2025-03-04', '2025-01-03T00:00:00.000Z')
  ];
  const expected = ['b', 'c', 'a'];

  assert.deepEqual(sortForList(items).map((item) => item.id), expected);
  assert.deepEqual(sortForList([...items].reverse()).map((item) => item.id), expected);
});
