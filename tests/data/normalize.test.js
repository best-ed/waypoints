import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeMemoryInput, normalizeTags, roundCoordinate } from '../../src/js/data/normalize.js';

test('trims the string fields', () => {
  const result = normalizeMemoryInput({
    title: '  Sunset at the pier  ',
    note: '\n  Cold wind.  \n',
    date: ' 2025-03-04 ',
    placeName: '  Nairobi  '
  });

  assert.equal(result.title, 'Sunset at the pier');
  assert.equal(result.note, 'Cold wind.');
  assert.equal(result.date, '2025-03-04');
  assert.equal(result.placeName, 'Nairobi');
});

test('defaults missing optional fields to empty values', () => {
  const result = normalizeMemoryInput({ title: 'Only a title' });

  assert.equal(result.note, '');
  assert.equal(result.placeName, '');
  assert.deepEqual(result.tags, []);
  assert.deepEqual(result.photoIds, []);
});

test('returns the empty shape for non-object input', () => {
  for (const input of [null, undefined, 'string', 7]) {
    const result = normalizeMemoryInput(input);
    assert.equal(result.title, '');
    assert.deepEqual(result.tags, []);
  }
});

test('lowercases, trims and dedupes tags', () => {
  const result = normalizeTags(['  Trail ', 'TRAIL', 'trail', ' View ']);
  assert.deepEqual(result, ['trail', 'view']);
});

test('drops empty and non-string tags', () => {
  const result = normalizeTags(['keep', '', '   ', 42, null, undefined, { tag: 'no' }]);
  assert.deepEqual(result, ['keep']);
});

test('preserves the order of first appearance for tags', () => {
  const result = normalizeTags(['zebra', 'apple', 'zebra', 'mango']);
  assert.deepEqual(result, ['zebra', 'apple', 'mango']);
});

test('returns an empty tag list when tags is not an array', () => {
  assert.deepEqual(normalizeTags('trail'), []);
  assert.deepEqual(normalizeTags(undefined), []);
});

test('rounds coordinates to six decimal places', () => {
  assert.equal(roundCoordinate(-1.29210049), -1.2921);
  assert.equal(roundCoordinate(36.8219006), 36.821901);
  assert.equal(roundCoordinate(12.3456784), 12.345678);
  assert.equal(roundCoordinate(12.3456786), 12.345679);
});

// Values sitting exactly on the 7th-decimal boundary follow whatever the float
// actually holds, which is a hair under the literal. Pinned so it stays deliberate.
test('rounds boundary values by the stored float, not the written literal', () => {
  assert.equal(roundCoordinate(36.8219005), 36.8219);
});

test('leaves coordinates that are already short alone', () => {
  assert.equal(roundCoordinate(0), 0);
  assert.equal(roundCoordinate(-90), -90);
  assert.equal(roundCoordinate(36.8219), 36.8219);
});

test('normalizes negative zero to zero', () => {
  assert.ok(Object.is(roundCoordinate(-0.0000001), 0));
  assert.ok(Object.is(roundCoordinate(-0), 0));
});

test('parses numeric strings into numbers', () => {
  assert.equal(roundCoordinate('36.8219'), 36.8219);
  assert.equal(roundCoordinate(' -1.2921 '), -1.2921);
});

test('passes non-numeric values through untouched', () => {
  assert.equal(roundCoordinate('abc'), 'abc');
  assert.equal(roundCoordinate(''), '');
  assert.equal(roundCoordinate(null), null);
  assert.equal(roundCoordinate(undefined), undefined);
  assert.ok(Number.isNaN(roundCoordinate(NaN)));
  assert.equal(roundCoordinate(Infinity), Infinity);
});

test('rounds coordinates supplied on the whole input', () => {
  const result = normalizeMemoryInput({ title: 'x', lat: -1.292100491, lng: '36.821900512' });
  assert.equal(result.lat, -1.29210);
  assert.equal(result.lng, 36.821901);
});

test('trims photo ids and drops blanks', () => {
  const result = normalizeMemoryInput({ title: 'x', photoIds: [' p1 ', '', 'p2', null] });
  assert.deepEqual(result.photoIds, ['p1', 'p2']);
});
