import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isRealCalendarDate, validateMemory } from '../../src/js/data/validate.js';
import { ValidationError } from '../../src/js/data/errors.js';
import { normalizeMemoryInput } from '../../src/js/data/normalize.js';
import {
  MAX_TAGS,
  NOTE_MAX_LENGTH,
  PLACE_NAME_MAX_LENGTH,
  TAG_MAX_LENGTH,
  TITLE_MAX_LENGTH
} from '../../src/js/data/schema.js';

function validMemory(overrides = {}) {
  return normalizeMemoryInput({
    title: 'Sunset at the pier',
    note: 'Cold wind.',
    date: '2025-03-04',
    lat: -1.2921,
    lng: 36.8219,
    placeName: 'Nairobi',
    tags: ['trail'],
    photoIds: [],
    ...overrides
  });
}

test('accepts a well formed memory', () => {
  const result = validateMemory(validMemory());
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, {});
});

test('rejects a missing or blank title', () => {
  for (const title of ['', '   ', undefined, null, 42]) {
    const result = validateMemory(validMemory({ title }));
    assert.equal(result.valid, false);
    assert.equal(result.errors.title, 'Title is required');
  }
});

test('accepts a title at the length limit and rejects one past it', () => {
  assert.equal(validateMemory(validMemory({ title: 'a'.repeat(TITLE_MAX_LENGTH) })).valid, true);

  const tooLong = validateMemory(validMemory({ title: 'a'.repeat(TITLE_MAX_LENGTH + 1) }));
  assert.equal(tooLong.valid, false);
  assert.match(tooLong.errors.title, /120 characters or fewer/);
});

test('accepts a single character title', () => {
  assert.equal(validateMemory(validMemory({ title: 'x' })).valid, true);
});

test('treats the note as optional but caps its length', () => {
  assert.equal(validateMemory(validMemory({ note: undefined })).valid, true);
  assert.equal(validateMemory(validMemory({ note: 'a'.repeat(NOTE_MAX_LENGTH) })).valid, true);

  const tooLong = validateMemory(validMemory({ note: 'a'.repeat(NOTE_MAX_LENGTH + 1) }));
  assert.equal(tooLong.valid, false);
  assert.match(tooLong.errors.note, /5000 characters or fewer/);
});

test('requires a date', () => {
  const result = validateMemory(validMemory({ date: '' }));
  assert.equal(result.valid, false);
  assert.equal(result.errors.date, 'Date is required');
});

test('rejects malformed date strings', () => {
  for (const date of ['4/3/2025', '2025-3-4', '20250304', '2025-03-04T00:00:00Z', 'yesterday']) {
    const result = validateMemory(validMemory({ date }));
    assert.equal(result.valid, false, `expected ${date} to be rejected`);
    assert.equal(result.errors.date, 'Date must be formatted as YYYY-MM-DD');
  }
});

test('rejects dates that are not real calendar days', () => {
  for (const date of ['2025-02-30', '2025-13-01', '2025-00-10', '2025-04-31', '2025-01-32', '2023-02-29']) {
    const result = validateMemory(validMemory({ date }));
    assert.equal(result.valid, false, `expected ${date} to be rejected`);
    assert.equal(result.errors.date, 'Date must be a real calendar date');
  }
});

test('accepts leap days only in leap years', () => {
  assert.equal(isRealCalendarDate('2024-02-29'), true);
  assert.equal(isRealCalendarDate('2000-02-29'), true);
  assert.equal(isRealCalendarDate('1900-02-29'), false);
  assert.equal(isRealCalendarDate('2023-02-29'), false);
});

test('accepts month and day boundaries', () => {
  assert.equal(isRealCalendarDate('2025-01-01'), true);
  assert.equal(isRealCalendarDate('2025-12-31'), true);
});

test('rejects latitude outside its range', () => {
  for (const lat of [-90.000001, 90.000001, 91, -1000]) {
    const result = validateMemory(validMemory({ lat }));
    assert.equal(result.valid, false, `expected ${lat} to be rejected`);
    assert.match(result.errors.lat, /between -90 and 90/);
  }
});

test('accepts latitude at both poles', () => {
  assert.equal(validateMemory(validMemory({ lat: -90 })).valid, true);
  assert.equal(validateMemory(validMemory({ lat: 90 })).valid, true);
});

test('rejects longitude outside its range', () => {
  for (const lng of [-180.000001, 180.000001, 181, 5000]) {
    const result = validateMemory(validMemory({ lng }));
    assert.equal(result.valid, false, `expected ${lng} to be rejected`);
    assert.match(result.errors.lng, /between -180 and 180/);
  }
});

test('accepts longitude at the antimeridian', () => {
  assert.equal(validateMemory(validMemory({ lng: -180 })).valid, true);
  assert.equal(validateMemory(validMemory({ lng: 180 })).valid, true);
});

test('rejects missing and non-numeric coordinates', () => {
  for (const value of [undefined, null, 'abc', NaN, Infinity, '']) {
    const latResult = validateMemory(validMemory({ lat: value }));
    assert.equal(latResult.valid, false);
    assert.equal(latResult.errors.lat, 'Latitude must be a number');

    const lngResult = validateMemory(validMemory({ lng: value }));
    assert.equal(lngResult.valid, false);
    assert.equal(lngResult.errors.lng, 'Longitude must be a number');
  }
});

test('treats place name as optional but caps its length', () => {
  assert.equal(validateMemory(validMemory({ placeName: undefined })).valid, true);
  assert.equal(validateMemory(validMemory({ placeName: 'a'.repeat(PLACE_NAME_MAX_LENGTH) })).valid, true);

  const tooLong = validateMemory(validMemory({ placeName: 'a'.repeat(PLACE_NAME_MAX_LENGTH + 1) }));
  assert.equal(tooLong.valid, false);
  assert.match(tooLong.errors.placeName, /200 characters or fewer/);
});

test('caps the number of tags', () => {
  const atLimit = Array.from({ length: MAX_TAGS }, (_, index) => 'tag' + index);
  assert.equal(validateMemory(validMemory({ tags: atLimit })).valid, true);

  const overLimit = Array.from({ length: MAX_TAGS + 1 }, (_, index) => 'tag' + index);
  const result = validateMemory(validMemory({ tags: overLimit }));
  assert.equal(result.valid, false);
  assert.match(result.errors.tags, /10 tags or fewer/);
});

test('caps the length of each tag', () => {
  assert.equal(validateMemory(validMemory({ tags: ['a'.repeat(TAG_MAX_LENGTH)] })).valid, true);

  const result = validateMemory(validMemory({ tags: ['a'.repeat(TAG_MAX_LENGTH + 1)] }));
  assert.equal(result.valid, false);
  assert.match(result.errors.tags, /30 characters or fewer/);
});

test('counts tags after deduplication', () => {
  const duplicated = Array.from({ length: MAX_TAGS + 4 }, () => 'same');
  assert.equal(validateMemory(validMemory({ tags: duplicated })).valid, true);
});

test('reports every failing field at once', () => {
  const result = validateMemory(validMemory({ title: '', date: '2025-02-30', lat: 500, lng: 'abc' }));
  assert.equal(result.valid, false);
  assert.deepEqual(Object.keys(result.errors).sort(), ['date', 'lat', 'lng', 'title']);
});

test('rejects non-object input outright', () => {
  for (const input of [null, undefined, 'memory', 7]) {
    assert.equal(validateMemory(input).valid, false);
  }
});

test('ValidationError carries the field errors', () => {
  const errors = { title: 'Title is required' };
  const error = new ValidationError(errors);

  assert.ok(error instanceof Error);
  assert.equal(error.name, 'ValidationError');
  assert.deepEqual(error.errors, errors);
  assert.equal(error.message, 'Memory failed validation');
});
