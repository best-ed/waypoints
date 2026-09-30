import { test } from 'node:test';
import assert from 'node:assert/strict';

import { serializeFilters, parseFilters } from '../../src/js/filters/filter-url.js';

const EMPTY = { query: '', tags: [], from: null, to: null };

test('an unfiltered view serializes to nothing at all', () => {
  assert.equal(serializeFilters(EMPTY).toString(), '');
  assert.equal(serializeFilters({}).toString(), '');
});

test('serializes a query', () => {
  assert.equal(serializeFilters({ ...EMPTY, query: 'sunset' }).get('q'), 'sunset');
});

test('trims a query and omits a blank one', () => {
  assert.equal(serializeFilters({ ...EMPTY, query: '  sunset  ' }).get('q'), 'sunset');
  assert.equal(serializeFilters({ ...EMPTY, query: '   ' }).has('q'), false);
});

test('joins tags with commas', () => {
  assert.equal(serializeFilters({ ...EMPTY, tags: ['trail', 'view'] }).get('tags'), 'trail,view');
});

test('omits an empty tag list', () => {
  assert.equal(serializeFilters({ ...EMPTY, tags: [] }).has('tags'), false);
});

test('serializes each end of the range', () => {
  const params = serializeFilters({ ...EMPTY, from: '2025-01-01', to: '2025-12-31' });

  assert.equal(params.get('from'), '2025-01-01');
  assert.equal(params.get('to'), '2025-12-31');
});

test('omits an end of the range that is not set', () => {
  const params = serializeFilters({ ...EMPTY, from: '2025-01-01' });

  assert.equal(params.get('from'), '2025-01-01');
  assert.equal(params.has('to'), false);
});

test('parses an empty search into empty filters', () => {
  for (const search of ['', '?', null, undefined]) {
    assert.deepEqual(parseFilters(search), EMPTY);
  }
});

test('parses every parameter', () => {
  const result = parseFilters('?q=sunset&tags=trail,view&from=2025-01-01&to=2025-12-31');

  assert.deepEqual(result, {
    query: 'sunset',
    tags: ['trail', 'view'],
    from: '2025-01-01',
    to: '2025-12-31'
  });
});

test('round trips a full set of filters', () => {
  const filters = { query: 'sunset drive', tags: ['trail', 'view'], from: '2025-01-01', to: '2025-12-31' };

  assert.deepEqual(parseFilters(serializeFilters(filters).toString()), filters);
});

test('round trips each dimension on its own', () => {
  for (const filters of [
    { ...EMPTY, query: 'sunset' },
    { ...EMPTY, tags: ['trail'] },
    { ...EMPTY, from: '2025-01-01' },
    { ...EMPTY, to: '2025-12-31' }
  ]) {
    assert.deepEqual(parseFilters(serializeFilters(filters).toString()), filters);
  }
});

test('round trips a query needing encoding', () => {
  const filters = { ...EMPTY, query: 'café & bar' };

  assert.deepEqual(parseFilters(serializeFilters(filters).toString()), filters);
});

test('normalizes tags on the way in', () => {
  const result = parseFilters('?tags=View,TRAIL,trail,,  food  ');

  assert.deepEqual(result.tags, ['food', 'trail', 'view']);
});

/* A URL can be edited or half-remembered, so a date that is not real is dropped rather
   than applied and quietly matching nothing. */
test('drops a date that is not a real calendar day', () => {
  for (const bad of ['2025-02-30', '2025-13-01', '2025-00-10', '2023-02-29']) {
    assert.equal(parseFilters('?from=' + bad).from, null, bad + ' is dropped');
    assert.equal(parseFilters('?to=' + bad).to, null);
  }
});

test('drops a malformed date', () => {
  for (const bad of ['2025-3-4', '04/03/2025', 'yesterday', '2025-03-04T00:00:00Z', '']) {
    assert.equal(parseFilters('?from=' + encodeURIComponent(bad)).from, null);
  }
});

test('keeps a valid date alongside a dropped one', () => {
  const result = parseFilters('?from=2025-02-30&to=2025-12-31');

  assert.equal(result.from, null);
  assert.equal(result.to, '2025-12-31');
});

test('swaps an inverted range rather than matching nothing', () => {
  const result = parseFilters('?from=2025-12-31&to=2025-01-01');

  assert.equal(result.from, '2025-01-01');
  assert.equal(result.to, '2025-12-31');
});

test('leaves a range that is already in order alone', () => {
  const result = parseFilters('?from=2025-01-01&to=2025-12-31');

  assert.equal(result.from, '2025-01-01');
  assert.equal(result.to, '2025-12-31');
});

test('leaves a single day range alone', () => {
  const result = parseFilters('?from=2025-06-15&to=2025-06-15');

  assert.equal(result.from, '2025-06-15');
  assert.equal(result.to, '2025-06-15');
});

test('does not swap when only one end survives', () => {
  const result = parseFilters('?from=2025-12-31&to=not-a-date');

  assert.equal(result.from, '2025-12-31');
  assert.equal(result.to, null);
});

test('ignores parameters it does not know', () => {
  const result = parseFilters('?q=sunset&unknown=value&zoom=12');

  assert.equal(result.query, 'sunset');
  assert.deepEqual(Object.keys(result).sort(), ['from', 'query', 'tags', 'to']);
});

test('trims a query from the URL', () => {
  assert.equal(parseFilters('?q=' + encodeURIComponent('  sunset  ')).query, 'sunset');
});

test('a sanitized parse is stable when round tripped again', () => {
  const once = parseFilters('?from=2025-12-31&to=2025-01-01&tags=View,view');
  const twice = parseFilters(serializeFilters(once).toString());

  assert.deepEqual(twice, once);
});
