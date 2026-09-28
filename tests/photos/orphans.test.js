import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeOrphans } from '../../src/js/photos/orphans.js';

function memory(photoIds) {
  return { id: 'm-' + photoIds.join('-'), photoIds };
}

test('finds stored ids that no memory references', () => {
  const stored = ['a', 'b', 'c', 'd'];
  const memories = [memory(['a']), memory(['c'])];

  assert.deepEqual(computeOrphans(stored, memories), ['b', 'd']);
});

test('returns nothing when every photo is referenced', () => {
  const stored = ['a', 'b'];
  const memories = [memory(['a', 'b'])];

  assert.deepEqual(computeOrphans(stored, memories), []);
});

test('treats every stored photo as an orphan when there are no memories', () => {
  assert.deepEqual(computeOrphans(['a', 'b'], []), ['a', 'b']);
});

test('returns nothing when nothing is stored', () => {
  assert.deepEqual(computeOrphans([], [memory(['a'])]), []);
});

test('ignores a referenced id that is not stored', () => {
  assert.deepEqual(computeOrphans(['a'], [memory(['a', 'missing'])]), []);
});

test('counts a photo referenced by any memory as kept', () => {
  const stored = ['shared', 'lonely'];
  const memories = [memory(['shared']), memory(['shared'])];

  assert.deepEqual(computeOrphans(stored, memories), ['lonely']);
});

test('keeps the stored order', () => {
  const stored = ['z', 'y', 'x', 'w'];
  const memories = [memory(['y'])];

  assert.deepEqual(computeOrphans(stored, memories), ['z', 'x', 'w']);
});

test('handles memories with no photos', () => {
  const memories = [memory([]), { id: 'no-field' }, memory(['keep'])];

  assert.deepEqual(computeOrphans(['keep', 'drop'], memories), ['drop']);
});

test('survives arguments that are not arrays', () => {
  assert.deepEqual(computeOrphans(null, []), []);
  assert.deepEqual(computeOrphans(undefined, []), []);
  assert.deepEqual(computeOrphans(['a'], null), ['a']);
  assert.deepEqual(computeOrphans(['a'], undefined), ['a']);
});

test('does not mutate its arguments', () => {
  const stored = ['a', 'b'];
  const memories = [memory(['a'])];

  computeOrphans(stored, memories);

  assert.deepEqual(stored, ['a', 'b']);
  assert.deepEqual(memories[0].photoIds, ['a']);
});
