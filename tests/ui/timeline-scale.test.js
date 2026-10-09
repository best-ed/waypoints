import { test } from 'node:test';
import assert from 'node:assert/strict';

import { barHeights, EMPTY_HEIGHT, FLAT_HEIGHT, MAX_HEIGHT, MIN_HEIGHT } from '../../src/js/ui/timeline-scale.js';

test('one bucket does not fill the track', () => {
  /* The reported case: with a single matching memory the histogram was one bar at full width
     and full height, which reads as a solid block rather than as a chart. */
  assert.deepEqual(barHeights([4]), [FLAT_HEIGHT]);
});

test('buckets that all hold the same amount sit at a resting height', () => {
  assert.deepEqual(barHeights([3, 3, 3, 3]), [FLAT_HEIGHT, FLAT_HEIGHT, FLAT_HEIGHT, FLAT_HEIGHT]);
});

test('equal non-empty buckets stay flat even with gaps between them', () => {
  assert.deepEqual(barHeights([2, 0, 2, 0]), [FLAT_HEIGHT, EMPTY_HEIGHT, FLAT_HEIGHT, EMPTY_HEIGHT]);
});

test('the tallest bucket reaches the top once there is a shape to show', () => {
  const heights = barHeights([1, 10]);

  assert.equal(heights[1], MAX_HEIGHT);
  assert.ok(heights[0] < heights[1]);
});

test('heights are proportional between the extremes', () => {
  assert.deepEqual(barHeights([10, 5, 20]), [50, 25, 100]);
});

test('a bucket with one memory beside a large one is still visible', () => {
  /* Proportionally this is 2.5% of the track, which at 48px is barely over a pixel. */
  const heights = barHeights([1, 40]);

  assert.equal(heights[0], MIN_HEIGHT);
  assert.ok(heights[0] >= MIN_HEIGHT);
});

test('an empty bucket is not a bar', () => {
  /* One occupied bucket among empty ones is still nothing to compare, so it rests flat for
     the same reason a single bucket does. */
  assert.deepEqual(barHeights([0, 5, 0]), [EMPTY_HEIGHT, FLAT_HEIGHT, EMPTY_HEIGHT]);
  assert.deepEqual(barHeights([0, 2, 0, 8]), [EMPTY_HEIGHT, 25, EMPTY_HEIGHT, 100]);
});

test('all empty gives no bars at all rather than dividing by zero', () => {
  assert.deepEqual(barHeights([0, 0, 0]), [EMPTY_HEIGHT, EMPTY_HEIGHT, EMPTY_HEIGHT]);
});

test('nothing in, nothing out', () => {
  assert.deepEqual(barHeights([]), []);
  assert.deepEqual(barHeights(null), []);
  assert.deepEqual(barHeights(undefined), []);
});

test('a junk count is treated as empty rather than poisoning the scale', () => {
  assert.deepEqual(barHeights([NaN, 5, Infinity, 10]), [EMPTY_HEIGHT, 50, EMPTY_HEIGHT, 100]);
});

test('every height is within the track', () => {
  for (const counts of [[1], [1, 2, 3], [0, 100], [7, 7, 1], [1, 1, 1, 99]]) {
    for (const height of barHeights(counts)) {
      assert.ok(height >= 0 && height <= MAX_HEIGHT, JSON.stringify(counts) + ' produced ' + height);
    }
  }
});
