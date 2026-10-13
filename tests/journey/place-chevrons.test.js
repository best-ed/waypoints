import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MAX_CHEVRONS, placeChevrons } from '../../src/js/journey/place-chevrons.js';

function line(...pairs) {
  return pairs.map(([x, y]) => ({ x, y }));
}

test('a path shorter than half the spacing gets none', () => {
  assert.deepEqual(placeChevrons(line([0, 0], [30, 0]), 80), []);
});

test('the first sits half a gap in', () => {
  const placed = placeChevrons(line([0, 0], [400, 0]), 80);

  assert.equal(placed[0].x, 40);
  assert.equal(placed[0].y, 0);
});

test('they are spaced by the gap along the path', () => {
  const placed = placeChevrons(line([0, 0], [400, 0]), 80);

  assert.deepEqual(
    placed.map((one) => one.x),
    [40, 120, 200, 280, 360]
  );
});

test('spacing is along the path, not across the screen', () => {
  /* Three sides of a square: the chevrons keep their spacing round the corners. */
  const placed = placeChevrons(line([0, 0], [100, 0], [100, 100], [0, 100]), 50);

  assert.equal(placed.length, 6);
  assert.deepEqual(placed[0], { x: 25, y: 0, angle: 0 });
  assert.equal(Math.round(placed[2].x), 100);
  assert.equal(Math.round(placed[2].y), 25);
});

test('the angle is the direction of the piece it sits on', () => {
  const [first] = placeChevrons(line([0, 0], [0, 400]), 80);

  assert.equal(first.angle, 90);
});

test('a leg of no length is stepped over rather than dividing by it', () => {
  const placed = placeChevrons(line([0, 0], [0, 0], [400, 0]), 80);

  assert.equal(placed.length, 5);
  assert.ok(placed.every((one) => Number.isFinite(one.angle)));
});

test('fewer than two points, or no spacing, place nothing', () => {
  assert.deepEqual(placeChevrons(line([0, 0]), 80), []);
  assert.deepEqual(placeChevrons(line([0, 0], [400, 0]), 0), []);
  assert.deepEqual(placeChevrons(null, 80), []);
});

test('only the part inside the bounds is drawn', () => {
  const bounds = { minX: 0, minY: -10, maxX: 200, maxY: 10 };
  const placed = placeChevrons(line([0, 0], [1000, 0]), 80, { bounds });

  assert.ok(placed.length > 0);
  assert.ok(
    placed.every((one) => one.x <= bounds.maxX),
    'placed outside the bounds: ' + JSON.stringify(placed)
  );
});

/* The reason the bounds exist: zoomed in, a leg across an ocean is millions of pixels long, and
   walking it a chevron at a time would be a hundred thousand iterations producing nothing. */
test('an off-screen stretch does not shift the ones that follow it', () => {
  const bounds = { minX: 0, minY: -10, maxX: 400, maxY: 10 };

  const withGap = placeChevrons(line([0, 0], [1e7, 0], [1e7, 1]), 80, { bounds });

  assert.ok(withGap.length <= MAX_CHEVRONS);
  assert.ok(withGap.every((one) => one.x <= 400));
});

test('never more than the cap, however the path folds', () => {
  const zigzag = [];
  for (let step = 0; step < 4000; step++) {
    zigzag.push({ x: step % 2 === 0 ? 0 : 500, y: step });
  }

  assert.equal(placeChevrons(zigzag, 10).length, MAX_CHEVRONS);
});
