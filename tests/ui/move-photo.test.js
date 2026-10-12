import { test } from 'node:test';
import assert from 'node:assert/strict';

import { movePhoto } from '../../src/js/ui/move-photo.js';

const LIST = ['a', 'b', 'c', 'd'];

test('moves an entry later', () => {
  assert.deepEqual(movePhoto(LIST, 0, 1), ['b', 'a', 'c', 'd']);
  assert.deepEqual(movePhoto(LIST, 1, 3), ['a', 'c', 'd', 'b']);
});

test('moves an entry earlier', () => {
  assert.deepEqual(movePhoto(LIST, 3, 2), ['a', 'b', 'd', 'c']);
  assert.deepEqual(movePhoto(LIST, 2, 0), ['c', 'a', 'b', 'd']);
});

/* The cover is the first entry and nothing in the record says so, which is the whole point:
   making a photo the cover is moving it to 0. */
test('making an entry the cover is moving it to the front', () => {
  assert.deepEqual(movePhoto(LIST, 2, 0), ['c', 'a', 'b', 'd']);
  assert.deepEqual(movePhoto(LIST, 0, 0), LIST);
});

test('does not touch the list it was given', () => {
  const original = [...LIST];
  movePhoto(original, 0, 3);
  assert.deepEqual(original, LIST);
});

/* "Move later" on the last photo and "move earlier" on the first are things people press.
   The answer is that nothing happens, not that the list comes back short. */
test('a target past either end is clamped rather than refused', () => {
  assert.deepEqual(movePhoto(LIST, 3, 9), LIST);
  assert.deepEqual(movePhoto(LIST, 0, -4), LIST);
  assert.deepEqual(movePhoto(LIST, 1, 99), ['a', 'c', 'd', 'b']);
});

test('an index that is not in the list leaves it alone', () => {
  assert.deepEqual(movePhoto(LIST, 9, 0), LIST);
  assert.deepEqual(movePhoto(LIST, -1, 0), LIST);
  assert.deepEqual(movePhoto(LIST, 1.5, 0), LIST);
  assert.deepEqual(movePhoto(LIST, null, 0), LIST);
});

test('a target that is not a number leaves the entry where it is', () => {
  assert.deepEqual(movePhoto(LIST, 1, null), LIST);
  assert.deepEqual(movePhoto(LIST, 1, 'first'), LIST);
});

test('an empty or missing list gives an empty list', () => {
  assert.deepEqual(movePhoto([], 0, 1), []);
  assert.deepEqual(movePhoto(null, 0, 1), []);
  assert.deepEqual(movePhoto(undefined, 0, 1), []);
});

test('a single entry has nowhere to go', () => {
  assert.deepEqual(movePhoto(['only'], 0, 1), ['only']);
  assert.deepEqual(movePhoto(['only'], 0, -1), ['only']);
});

/* Every move is reversible, which is what makes "move earlier" and "move later" a pair the
   reader can trust rather than two separate things that happen to be near each other. */
test('moving an entry and moving it back gives the list it started with', () => {
  for (let from = 0; from < LIST.length; from += 1) {
    for (let to = 0; to < LIST.length; to += 1) {
      assert.deepEqual(movePhoto(movePhoto(LIST, from, to), to, from), LIST, from + ' -> ' + to);
    }
  }
});

test('every move keeps the same entries', () => {
  for (let from = 0; from < LIST.length; from += 1) {
    for (let to = 0; to < LIST.length; to += 1) {
      assert.deepEqual([...movePhoto(LIST, from, to)].sort(), [...LIST].sort());
    }
  }
});
