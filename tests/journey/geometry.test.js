import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  haversineKm,
  interpolateGreatCircle,
  interpolatedPointCount,
  unwrapLongitudes,
  segmentPath,
  GREAT_CIRCLE_THRESHOLD_KM,
  MAX_INTERPOLATED_POINTS
} from '../../src/js/journey/geometry.js';

const CITY = {
  nairobi: { lat: -1.2921, lng: 36.8219 },
  mombasa: { lat: -4.0435, lng: 39.6682 },
  london: { lat: 51.5074, lng: -0.1278 },
  manchester: { lat: 53.4808, lng: -2.2426 },
  paris: { lat: 48.8566, lng: 2.3522 },
  newYork: { lat: 40.7128, lng: -74.006 },
  honolulu: { lat: 21.3069, lng: -157.8583 },
  sydney: { lat: -33.8688, lng: 151.2093 },
  losAngeles: { lat: 34.0522, lng: -118.2437 },
  tokyo: { lat: 35.6762, lng: 139.6503 },
  suva: { lat: -18.1248, lng: 178.4501 },
  apia: { lat: -13.8333, lng: -171.7667 }
};

const TOLERANCE = 0.005;

function assertWithin(actual, expected, label) {
  const drift = Math.abs(actual - expected) / expected;
  assert.ok(
    drift <= TOLERANCE,
    label + ': got ' + actual.toFixed(1) + ' km, expected ~' + expected + ' km (off by ' + (drift * 100).toFixed(2) + '%)'
  );
}

/* Published great-circle distances. These pin the radius and the formula together: a sign
   error or a degrees/radians slip shows up here immediately. */
test('matches known city-pair distances within 0.5%', () => {
  assertWithin(haversineKm(CITY.london, CITY.paris), 344, 'London to Paris');
  assertWithin(haversineKm(CITY.london, CITY.newYork), 5570, 'London to New York');
  assertWithin(haversineKm(CITY.nairobi, CITY.london), 6820, 'Nairobi to London');
  assertWithin(haversineKm(CITY.sydney, CITY.losAngeles), 12073, 'Sydney to Los Angeles');
  assertWithin(haversineKm(CITY.tokyo, CITY.losAngeles), 8815, 'Tokyo to Los Angeles');
  assertWithin(haversineKm(CITY.nairobi, CITY.mombasa), 440, 'Nairobi to Mombasa');
});

test('distance is symmetric', () => {
  assert.equal(
    haversineKm(CITY.nairobi, CITY.honolulu),
    haversineKm(CITY.honolulu, CITY.nairobi)
  );
});

test('a point is no distance from itself', () => {
  assert.equal(haversineKm(CITY.nairobi, { ...CITY.nairobi }), 0);
});

test('a quarter of the way round the equator is about 10,007 km', () => {
  assertWithin(haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 90 }), 10007, 'quarter equator');
});

test('near-antipodal points do not produce NaN', () => {
  const distance = haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 180 });

  assert.ok(Number.isFinite(distance));
  assertWithin(distance, 20015, 'half the equator');
});

test('a missing or unusable coordinate measures nothing rather than NaN', () => {
  for (const bad of [null, undefined, {}, { lat: 1 }, { lat: Number.NaN, lng: 1 }]) {
    assert.equal(haversineKm(CITY.nairobi, bad), 0);
    assert.equal(haversineKm(bad, CITY.nairobi), 0);
  }
});

/* The defining property of a great circle: it is the shortest path, so an intermediate
   point on it adds nothing to the total. A lat/lng midpoint would not satisfy this. */
test('interpolated points lie on the great circle', () => {
  const direct = haversineKm(CITY.nairobi, CITY.honolulu);
  const points = interpolateGreatCircle(CITY.nairobi, CITY.honolulu, 8);

  assert.equal(points.length, 8);

  for (const point of points) {
    const viaPoint = haversineKm(CITY.nairobi, point) + haversineKm(point, CITY.honolulu);
    assertWithin(viaPoint, direct, 'leg through an interpolated point');
  }
});

test('the whole interpolated path is no longer than the direct distance', () => {
  for (const [a, b] of [
    [CITY.nairobi, CITY.honolulu],
    [CITY.london, CITY.newYork],
    [CITY.sydney, CITY.losAngeles]
  ]) {
    const path = segmentPath(a, b);
    let total = 0;
    for (let index = 1; index < path.length; index++) {
      total += haversineKm(path[index - 1], path[index]);
    }
    assertWithin(total, haversineKm(a, b), 'summed path');
  }
});

test('the midpoint of a symmetric equatorial pair sits on the equator', () => {
  const [middle] = interpolateGreatCircle({ lat: 0, lng: -40 }, { lat: 0, lng: 40 }, 1);

  assert.ok(Math.abs(middle.lat) < 1e-9, 'latitude stays on the equator');
  assert.ok(Math.abs(middle.lng) < 1e-9, 'longitude is the midpoint');
});

/* Over a long span a great-circle path bows away from the straight lat/lng line. London to
   Tokyo should pass well north of the latitude either city sits at. */
test('a long arc curves away from the straight line', () => {
  const points = interpolateGreatCircle(CITY.london, CITY.tokyo, 9);
  const highest = Math.max(...points.map((point) => point.lat));

  assert.ok(
    highest > CITY.london.lat,
    'the arc rises above London, not between the two latitudes: got ' + highest.toFixed(2)
  );
});

test('interpolating coincident points gives nothing to draw', () => {
  assert.deepEqual(interpolateGreatCircle(CITY.nairobi, { ...CITY.nairobi }, 4), []);
});

test('interpolating exact antipodes gives nothing rather than NaN', () => {
  const points = interpolateGreatCircle({ lat: 0, lng: 0 }, { lat: 0, lng: 180 }, 4);

  for (const point of points) {
    assert.ok(Number.isFinite(point.lat) && Number.isFinite(point.lng));
  }
});

test('interpolation rejects a nonsense count', () => {
  for (const count of [0, -1, Number.NaN, null, undefined]) {
    assert.deepEqual(interpolateGreatCircle(CITY.london, CITY.tokyo, count), []);
  }
});

test('interpolation is capped', () => {
  assert.equal(
    interpolateGreatCircle(CITY.london, CITY.tokyo, 5000).length,
    MAX_INTERPOLATED_POINTS
  );
});

/* Short segments are left as a single straight pair: at this scale the curve is below a
   pixel, so the extra points would be invisible work. */
test('short segments are not interpolated', () => {
  for (const [a, b] of [
    [CITY.london, CITY.manchester],
    [CITY.nairobi, { lat: -0.3031, lng: 36.08 }]
  ]) {
    assert.ok(haversineKm(a, b) < GREAT_CIRCLE_THRESHOLD_KM, 'the pair really is short');
    assert.equal(segmentPath(a, b).length, 2, 'just the two endpoints');
  }
});

test('the threshold itself is not interpolated, just past it is', () => {
  assert.equal(interpolatedPointCount(GREAT_CIRCLE_THRESHOLD_KM), 0);
  assert.ok(interpolatedPointCount(GREAT_CIRCLE_THRESHOLD_KM + 1) > 0);
  assert.equal(interpolatedPointCount(0), 0);
  assert.equal(interpolatedPointCount(Number.NaN), 0);
});

test('a long segment is interpolated', () => {
  assert.ok(segmentPath(CITY.nairobi, CITY.honolulu).length > 2);
  assert.ok(segmentPath(CITY.london, CITY.newYork).length > 2);
});

/* The failure this guards: Leaflet draws the longitudes it is handed, so a pair reading
   36.8 then -157.9 is drawn the long way back across Africa and the Atlantic. Unwrapped,
   the second reads 202.1 and the line continues east over Asia. */
test('a Nairobi to Honolulu path never jumps more than 180 degrees', () => {
  const path = segmentPath(CITY.nairobi, CITY.honolulu);

  for (let index = 1; index < path.length; index++) {
    const jump = Math.abs(path[index].lng - path[index - 1].lng);
    assert.ok(jump <= 180, 'consecutive longitudes differ by ' + jump.toFixed(2) + ' degrees');
  }
});

test('the unwrapped Honolulu end stays the same place, 360 degrees over', () => {
  const path = segmentPath(CITY.nairobi, CITY.honolulu);
  const last = path[path.length - 1];

  assert.equal(last.lat, CITY.honolulu.lat);
  assert.ok(Math.abs(last.lng - (CITY.honolulu.lng + 360)) < 1e-9, 'lng is -157.86 + 360');
});

test('no segment path anywhere jumps more than 180 degrees', () => {
  const names = Object.keys(CITY);

  for (const from of names) {
    for (const to of names) {
      const path = segmentPath(CITY[from], CITY[to]);
      for (let index = 1; index < path.length; index++) {
        const jump = Math.abs(path[index].lng - path[index - 1].lng);
        assert.ok(jump <= 180, from + ' to ' + to + ' jumps ' + jump.toFixed(2) + ' degrees');
      }
    }
  }
});

test('a short hop across the antimeridian goes the short way', () => {
  const path = unwrapLongitudes([CITY.suva, CITY.apia]);

  assert.ok(path[1].lng > 180, 'Apia reads past 180 rather than back at -171: ' + path[1].lng);
  assert.ok(path[1].lng - path[0].lng < 180);
});

test('unwrapping leaves an ordinary path untouched', () => {
  const input = [CITY.london, CITY.paris, CITY.nairobi];

  assert.deepEqual(
    unwrapLongitudes(input),
    input.map((point) => ({ lat: point.lat, lng: point.lng }))
  );
});

test('unwrapping accumulates across several crossings', () => {
  const path = unwrapLongitudes([
    { lat: 0, lng: 170 },
    { lat: 0, lng: -170 },
    { lat: 0, lng: 170 },
    { lat: 0, lng: -170 }
  ]);

  assert.deepEqual(
    path.map((point) => point.lng),
    [170, 190, 170, 190]
  );
});

test('unwrapping does not mutate its input', () => {
  const input = [
    { lat: 0, lng: 170 },
    { lat: 0, lng: -170 }
  ];

  unwrapLongitudes(input);

  assert.equal(input[1].lng, -170);
});

test('unwrapping copes with odd input', () => {
  assert.deepEqual(unwrapLongitudes([]), []);
  assert.deepEqual(unwrapLongitudes(null), []);
  assert.deepEqual(unwrapLongitudes([{ lat: 'x', lng: 1 }]), []);
  assert.deepEqual(unwrapLongitudes([{ lat: 1, lng: 2 }]), [{ lat: 1, lng: 2 }]);
});

test('a segment path needs two usable endpoints', () => {
  assert.deepEqual(segmentPath(CITY.london, null), []);
  assert.deepEqual(segmentPath({ lat: 1 }, CITY.london), []);
});
