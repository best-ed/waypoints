import { test } from 'node:test';
import assert from 'node:assert/strict';

import { toPlaceResult, toPlaceResults, shortPlaceName } from '../../src/js/geo/parse-place.js';
import {
  searchNairobi,
  searchNoName,
  searchMalformed,
  reverseRoad,
  reverseNamed,
  reverseAreaOnly,
  reverseNothing
} from '../helpers/nominatim-fixtures.js';

test('parses a search result into the shape the map needs', () => {
  const result = toPlaceResult(searchNairobi[0]);

  assert.equal(result.name, 'Nairobi');
  assert.equal(result.displayName, 'Nairobi, Kenya');
  assert.equal(result.lat, -1.2832533);
  assert.equal(result.lng, 36.8172449);
  assert.equal(result.id, '298060458');
});

/* Nominatim sends lat and lon as strings; everything downstream expects numbers. */
test('converts coordinates from strings to numbers', () => {
  const result = toPlaceResult(searchNairobi[0]);

  assert.equal(typeof result.lat, 'number');
  assert.equal(typeof result.lng, 'number');
});

/* boundingbox is [south, north, west, east]; Leaflet wants [[s, w], [n, e]]. */
test('reorders the bounding box for Leaflet', () => {
  const result = toPlaceResult(searchNairobi[0]);

  assert.deepEqual(result.bounds, [
    [-1.4449849, 36.6509378],
    [-1.1605795, 37.1038879]
  ]);
});

test('falls back to the first part of display_name when there is no name', () => {
  const result = toPlaceResult(searchNoName[0]);

  assert.equal(result.name, 'Westminster');
  assert.equal(result.displayName, 'Westminster, London, Greater London, England, SW1A 2DU, United Kingdom');
});

test('returns null for a result with no usable coordinates', () => {
  assert.equal(toPlaceResult(searchMalformed[0]), null);
  assert.equal(toPlaceResult(searchMalformed[1]), null);
});

test('returns null for a result with no usable name', () => {
  assert.equal(toPlaceResult(searchMalformed[2]), null);
});

test('returns null for values that are not results', () => {
  for (const value of [null, undefined, 'a string', 42, []]) {
    assert.equal(toPlaceResult(value), null);
  }
});

test('leaves bounds null when the bounding box is unusable', () => {
  const result = toPlaceResult(searchMalformed[5]);

  assert.equal(result.name, 'Good one');
  assert.equal(result.bounds, null);
});

test('parses a whole list and drops the unusable entries', () => {
  const results = toPlaceResults(searchMalformed);

  assert.equal(results.length, 1);
  assert.equal(results[0].name, 'Good one');
});

test('parses every good result in a real response', () => {
  const results = toPlaceResults(searchNairobi);

  assert.equal(results.length, 2);
  assert.deepEqual(results.map((r) => r.name), ['Nairobi', 'Nairobi National Park']);
});

test('returns an empty list for anything that is not an array', () => {
  for (const value of [null, undefined, {}, 'results']) {
    assert.deepEqual(toPlaceResults(value), []);
  }
});

test('prefers the name outright when reverse geocoding gives one', () => {
  assert.equal(shortPlaceName(reverseNamed), 'Uhuru Park');
});

test('combines road and area when there is no name', () => {
  assert.equal(shortPlaceName(reverseRoad), 'Kenyatta Avenue, Central Business District');
});

test('uses the most specific area part when there is no road', () => {
  assert.equal(shortPlaceName(reverseAreaOnly), 'Kirinyaga');
});

/* The whole point: never hand back the full comma-separated chain. */
test('never returns the entire display name', () => {
  for (const fixture of [reverseRoad, reverseNamed, reverseAreaOnly]) {
    const short = shortPlaceName(fixture);

    assert.notEqual(short, fixture.display_name);
    assert.ok(short.length < fixture.display_name.length, 'shorter than display_name');
    assert.ok(!short.endsWith('Kenya'), 'does not trail into the country');
  }
});

/* Checked per segment, not by substring: "Kenyatta Avenue" legitimately contains the
   letters of "Kenya". */
test('does not include a postcode or country', () => {
  const segments = shortPlaceName(reverseRoad).split(', ');

  assert.ok(!segments.includes('Kenya'), 'country is not a segment');
  assert.ok(!segments.includes('00100'), 'postcode is not a segment');
  assert.deepEqual(segments, ['Kenyatta Avenue', 'Central Business District']);
});

test('returns an empty string when there is nothing to name', () => {
  assert.equal(shortPlaceName(reverseNothing), '');
  assert.equal(shortPlaceName({}), '');
});

test('survives values that are not reverse results', () => {
  for (const value of [null, undefined, 'place', 42]) {
    assert.equal(shortPlaceName(value), '');
  }
});

test('falls back to the first display_name part when address is missing', () => {
  const result = shortPlaceName({ display_name: 'Somewhere, Else, Kenya' });
  assert.equal(result, 'Somewhere');
});

test('prefers a pedestrian way when there is no road', () => {
  const result = shortPlaceName({
    address: { pedestrian: 'Mama Ngina Street', city: 'Nairobi' }
  });

  assert.equal(result, 'Mama Ngina Street, Nairobi');
});
