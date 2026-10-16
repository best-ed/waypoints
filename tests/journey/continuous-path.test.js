import { test } from 'node:test';
import assert from 'node:assert/strict';

import { continuousPath, splitPathAtStop } from '../../src/js/journey/continuous-path.js';

function stop(lat, lng) {
  return { lat, lng };
}

/* Under the 300km interpolation threshold, so the point list is the stops themselves and a
   test about indices says what it means. */
const NAIROBI = stop(-1.2864, 36.8172);
const THIKA = stop(-1.0333, 37.0693);
const NAIVASHA = stop(-0.7167, 36.4333);

test('an empty journey draws nothing', () => {
  assert.deepEqual(continuousPath([]), { points: [], stopIndices: [] });
  assert.deepEqual(continuousPath(null), { points: [], stopIndices: [] });
});

test('one stop is one point and no line', () => {
  const { points, stopIndices } = continuousPath([NAIROBI]);

  assert.equal(points.length, 1);
  assert.deepEqual(stopIndices, [0]);
});

test('short legs join into one run with every stop indexed', () => {
  const { points, stopIndices } = continuousPath([NAIROBI, THIKA, NAIVASHA]);

  assert.equal(points.length, 3);
  assert.deepEqual(stopIndices, [0, 1, 2]);
  assert.equal(points[2].lng, NAIVASHA.lng);
});

test('stops without usable coordinates are dropped', () => {
  const { stopIndices } = continuousPath([NAIROBI, { lat: null, lng: 4 }, THIKA]);

  assert.equal(stopIndices.length, 2);
});

test('two stops at the same spot share one point', () => {
  const { points, stopIndices } = continuousPath([NAIROBI, { ...NAIROBI }, THIKA]);

  assert.deepEqual(stopIndices, [0, 0, 1]);
  assert.equal(points.length, 2);
});

test('a long leg is interpolated along the great circle', () => {
  const { points, stopIndices } = continuousPath([NAIROBI, stop(40.7128, -74.006)]);

  assert.ok(points.length > 10, 'expected intermediate points, got ' + points.length);
  assert.equal(stopIndices[1], points.length - 1);
});

test('a leg crossing the antimeridian continues past 180 rather than doubling back', () => {
  const { points, stopIndices } = continuousPath([stop(-18.1248, 178.4501), stop(21.3069, -157.8583)]);

  const end = points[stopIndices[1]];

  assert.ok(end.lng > 180, 'expected the drawn end past 180, got ' + end.lng);
  assert.equal(Math.round(end.lng - 360), Math.round(-157.8583));
});

test('the stop after a crossing starts a new line at the longitude the world has', () => {
  const { points, stopIndices } = continuousPath([
    stop(-18.1248, 178.4501),
    stop(21.3069, -157.8583),
    stop(35.6762, 139.6503)
  ]);

  const cutAt = stopIndices[1] + 1;

  assert.equal(points[cutAt].cut, true);
  assert.equal(points[cutAt].lng, -157.8583);
});

/* Without the cut the run drifts a whole turn per crossing, and a path drawn at a longitude of
   -700 is two copies of the world away from anything anybody is looking at. */
test('repeated crossings never drift more than a turn from the real longitudes', () => {
  const laps = [];
  for (let lap = 0; lap < 4; lap++) {
    laps.push(stop(0, 170), stop(0, -170), stop(0, 170));
  }

  const { points } = continuousPath(laps);

  for (const point of points) {
    assert.ok(Math.abs(point.lng) <= 360, 'drifted to ' + point.lng);
  }
});

test('splitting with no position leaves the whole path ahead', () => {
  const { points, stopIndices } = continuousPath([NAIROBI, THIKA, NAIVASHA]);
  const { travelled, remaining } = splitPathAtStop(points, stopIndices, null);

  assert.deepEqual(travelled, []);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].length, 3);
});

test('splitting at the first stop leaves nothing behind the playhead', () => {
  const { points, stopIndices } = continuousPath([NAIROBI, THIKA, NAIVASHA]);

  assert.deepEqual(splitPathAtStop(points, stopIndices, 0).travelled, []);
});

test('splitting at the last stop leaves nothing ahead', () => {
  const { points, stopIndices } = continuousPath([NAIROBI, THIKA, NAIVASHA]);
  const { travelled, remaining } = splitPathAtStop(points, stopIndices, 2);

  assert.equal(travelled.length, 1);
  assert.equal(travelled[0].length, 3);
  assert.deepEqual(remaining, []);
});

test('the two halves meet at the stop rather than leaving a gap', () => {
  const { points, stopIndices } = continuousPath([NAIROBI, THIKA, NAIVASHA]);
  const { travelled, remaining } = splitPathAtStop(points, stopIndices, 1);

  const lastTravelled = travelled[0][travelled[0].length - 1];
  const firstRemaining = remaining[0][0];

  assert.deepEqual(lastTravelled, firstRemaining);
  assert.deepEqual(lastTravelled, { lat: THIKA.lat, lng: THIKA.lng });
});

test('a cut becomes a second line rather than a line across the map', () => {
  const { points, stopIndices } = continuousPath([
    stop(-18.1248, 178.4501),
    stop(21.3069, -157.8583),
    stop(35.6762, 139.6503)
  ]);

  const { remaining } = splitPathAtStop(points, stopIndices, null);

  assert.equal(remaining.length, 2);
});

test('a line of one point is dropped, because it has nothing to draw', () => {
  const { points, stopIndices } = continuousPath([
    stop(-18.1248, 178.4501),
    stop(21.3069, -157.8583),
    stop(35.6762, 139.6503)
  ]);

  /* Stop 1 is the crossing: everything ahead of it starts with the point that ends the
     incoming leg, which is alone on its side of the cut. */
  const { remaining } = splitPathAtStop(points, stopIndices, 1);

  for (const line of remaining) {
    assert.ok(line.length > 1, 'a line of ' + line.length + ' point(s) survived');
  }
});

test('an out of range position is treated as the end rather than throwing', () => {
  const { points, stopIndices } = continuousPath([NAIROBI, THIKA]);

  assert.deepEqual(splitPathAtStop(points, stopIndices, 99).remaining, []);
});

test('splitting an empty path is empty both ways', () => {
  assert.deepEqual(splitPathAtStop([], [], 0), { travelled: [], remaining: [] });
  assert.deepEqual(splitPathAtStop(null, null, 1), { travelled: [], remaining: [] });
});
