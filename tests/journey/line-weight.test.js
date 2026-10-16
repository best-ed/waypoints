import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_LINE_WEIGHT,
  MIN_LINE_WEIGHT,
  THICKEST_AT_ZOOM,
  THINNEST_AT_ZOOM,
  weightForZoom
} from '../../src/js/journey/line-weight.js';

test('sits at the thin end at and below the low zoom', () => {
  assert.equal(weightForZoom(THINNEST_AT_ZOOM), MIN_LINE_WEIGHT);
  assert.equal(weightForZoom(0), MIN_LINE_WEIGHT);
  assert.equal(weightForZoom(-4), MIN_LINE_WEIGHT);
});

test('sits at the thick end at and above the high zoom', () => {
  assert.equal(weightForZoom(THICKEST_AT_ZOOM), MAX_LINE_WEIGHT);
  assert.equal(weightForZoom(19), MAX_LINE_WEIGHT);
});

test('thickens as the map comes in', () => {
  let previous = weightForZoom(THINNEST_AT_ZOOM);

  for (let zoom = THINNEST_AT_ZOOM + 1; zoom <= THICKEST_AT_ZOOM; zoom++) {
    const weight = weightForZoom(zoom);
    assert.ok(weight > previous, 'zoom ' + zoom + ' gave ' + weight + ' after ' + previous);
    previous = weight;
  }
});

test('a fractional zoom lands between its neighbours', () => {
  const middle = (THINNEST_AT_ZOOM + THICKEST_AT_ZOOM) / 2;

  assert.ok(weightForZoom(middle) > MIN_LINE_WEIGHT);
  assert.ok(weightForZoom(middle) < MAX_LINE_WEIGHT);
});

/* Written into the DOM on every zoom, so it must not carry fifteen decimal places. */
test('rounded to two decimals', () => {
  for (let zoom = 0; zoom <= 19; zoom += 0.37) {
    const weight = weightForZoom(zoom);
    assert.equal(weight, Number(weight.toFixed(2)));
  }
});

test('a zoom that is not a number falls back to the full stroke', () => {
  assert.equal(weightForZoom(undefined), MAX_LINE_WEIGHT);
  assert.equal(weightForZoom(NaN), MAX_LINE_WEIGHT);
  assert.equal(weightForZoom('11'), MAX_LINE_WEIGHT);
});
