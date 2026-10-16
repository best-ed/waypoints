import { test } from 'node:test';
import assert from 'node:assert/strict';

import { groupMemoriesByYear, yearOf } from '../../src/js/ui/group-by-year.js';

const memory = (id, date) => ({ id, title: id, date });

test('a year is read from the string', () => {
  assert.equal(yearOf('2021-03-04'), '2021');
  /* The one a Date gets wrong for anyone behind UTC: midnight UTC on the first of January
     is the thirty-first of December locally. */
  assert.equal(yearOf('2021-01-01'), '2021');
  assert.equal(yearOf('2021-12-31'), '2021');
});

test('an unusable date yields no year rather than a guess', () => {
  for (const value of ['', 'nonsense', '2021-3-4', null, undefined, 2021, {}]) {
    assert.equal(yearOf(value), null, JSON.stringify(value));
  }
});

test('consecutive memories in one year make one group', () => {
  const groups = groupMemoriesByYear([
    memory('a', '2024-06-01'),
    memory('b', '2024-03-01'),
    memory('c', '2023-11-01')
  ]);

  assert.deepEqual(groups.map((group) => group.year), ['2024', '2023']);
  assert.deepEqual(groups[0].memories.map((m) => m.id), ['a', 'b']);
  assert.deepEqual(groups[1].memories.map((m) => m.id), ['c']);
});

test('the order it is given is the order it keeps', () => {
  /* It groups, it does not sort. The list has already decided the order and two places
     deciding it is how the list and the map come to disagree. */
  const input = [memory('a', '2023-01-01'), memory('b', '2024-01-01'), memory('c', '2023-05-01')];
  const groups = groupMemoriesByYear(input);

  assert.deepEqual(groups.map((group) => group.year), ['2023', '2024', '2023']);
  assert.deepEqual(groups.flatMap((group) => group.memories).map((m) => m.id), ['a', 'b', 'c']);
});

test('every memory comes out exactly once', () => {
  const input = Array.from({ length: 50 }, (_, i) => memory('m' + i, 2020 + (i % 5) + '-0' + ((i % 9) + 1) + '-01'));
  const out = groupMemoriesByYear(input).flatMap((group) => group.memories);

  assert.equal(out.length, input.length);
  assert.deepEqual(out.map((m) => m.id), input.map((m) => m.id));
});

test('a memory with an unusable date is kept, under its own heading', () => {
  const groups = groupMemoriesByYear([
    memory('a', '2024-01-01'),
    memory('b', 'nonsense'),
    memory('c', '2023-01-01')
  ]);

  assert.deepEqual(groups.map((group) => group.year), ['2024', 'Undated', '2023']);
  assert.deepEqual(groups[1].memories.map((m) => m.id), ['b']);
});

test('a missing record does not throw', () => {
  const groups = groupMemoriesByYear([null, undefined, memory('a', '2024-01-01')]);

  assert.equal(groups.flatMap((group) => group.memories).length, 3);
});

test('the memories are the same objects, not copies', () => {
  /* The list renders from these and keys on identity in places; copying would break that
     quietly rather than loudly. */
  const one = memory('a', '2024-01-01');
  const [group] = groupMemoriesByYear([one]);

  assert.equal(group.memories[0], one);
});

test('nothing in, nothing out', () => {
  assert.deepEqual(groupMemoriesByYear([]), []);
  assert.deepEqual(groupMemoriesByYear(null), []);
  assert.deepEqual(groupMemoriesByYear(undefined), []);
  assert.deepEqual(groupMemoriesByYear('nope'), []);
});
