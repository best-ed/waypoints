import { test } from 'node:test';
import assert from 'node:assert/strict';

import { findNeighbours } from '../../src/js/ui/neighbours.js';

const ORDER = ['c', 'b', 'a'];

test('finds the neighbours in the middle of the order', () => {
  assert.deepEqual(findNeighbours(ORDER, 'b'), { index: 1, previous: 'c', next: 'a' });
});

/* The ends are the case Previous and Next have to get right, because the buttons are
   aria-disabled rather than disabled: they stay in the tab order, so they stay pressable and
   have to do nothing rather than step off the end. */
test('the first entry has no previous', () => {
  assert.deepEqual(findNeighbours(ORDER, 'c'), { index: 0, previous: null, next: 'b' });
});

test('the last entry has no next', () => {
  assert.deepEqual(findNeighbours(ORDER, 'a'), { index: 2, previous: 'b', next: null });
});

test('a single entry has neither', () => {
  assert.deepEqual(findNeighbours(['only'], 'only'), { index: 0, previous: null, next: null });
});

/* The detail view can be open on a memory a filter has just excluded, or one that was
   deleted. Both arrive here as an id the order no longer holds. */
test('an id that is not in the order has no position and no neighbours', () => {
  assert.deepEqual(findNeighbours(ORDER, 'gone'), { index: -1, previous: null, next: null });
  assert.deepEqual(findNeighbours([], 'c'), { index: -1, previous: null, next: null });
});

test('a missing order is treated as empty rather than throwing', () => {
  for (const ids of [null, undefined, 'c,b,a', 42]) {
    assert.deepEqual(findNeighbours(ids, 'c'), { index: -1, previous: null, next: null });
  }
});

test('reads the order it is given rather than sorting it', () => {
  const unsorted = ['a', 'c', 'b'];
  assert.deepEqual(findNeighbours(unsorted, 'c'), { index: 1, previous: 'a', next: 'b' });
  assert.deepEqual(unsorted, ['a', 'c', 'b']);
});

/* Stepping with Next from the first id has to reach the last one and stop, which is the
   whole contract the detail view's two buttons are built on. */
test('stepping forward then back returns to where it started', () => {
  let id = 'c';
  const visited = [id];

  for (;;) {
    const { next } = findNeighbours(ORDER, id);
    if (!next) break;
    id = next;
    visited.push(id);
  }

  assert.deepEqual(visited, ['c', 'b', 'a']);

  const back = [];
  for (;;) {
    const { previous } = findNeighbours(ORDER, id);
    if (!previous) break;
    id = previous;
    back.push(id);
  }

  assert.deepEqual(back, ['b', 'c']);
});
