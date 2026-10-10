import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MEMORY_PARAM, parseMemoryId, withMemoryId } from '../../src/js/filters/memory-url.js';
import { serializeFilters, parseFilters } from '../../src/js/filters/filter-url.js';

test('reads the memory id out of a query string', () => {
  assert.equal(parseMemoryId('?memory=abc123'), 'abc123');
  assert.equal(parseMemoryId('memory=abc123'), 'abc123');
});

test('no memory param means no memory', () => {
  for (const search of ['', '?', '?q=trail', null, undefined]) {
    assert.equal(parseMemoryId(search), null);
  }
});

/* A URL can be edited, shared or half-remembered, so nothing in it is trusted. There is no
   pattern to check against - restore and import keep whatever ids a file carried - so this
   is the whole of the sanitizing, and main.js drops an id the store does not hold. */
test('junk ids come back as nothing', () => {
  assert.equal(parseMemoryId('?memory='), null);
  assert.equal(parseMemoryId('?memory=%20%20'), null);
  assert.equal(parseMemoryId('?memory=' + 'x'.repeat(201)), null);
});

test('a long but plausible id is kept', () => {
  const id = 'x'.repeat(200);
  assert.equal(parseMemoryId('?memory=' + id), id);
});

test('surrounding whitespace is trimmed off', () => {
  assert.equal(parseMemoryId('?memory=%20abc%20'), 'abc');
});

test('an id with characters a URL has to encode survives the round trip', () => {
  const id = 'a b&c=d#e';
  const params = withMemoryId(new URLSearchParams(), id);
  assert.equal(parseMemoryId('?' + params.toString()), id);
});

test('writes the id into a params object without touching the original', () => {
  const filters = serializeFilters({ query: 'trail', tags: ['rain'] });
  const withId = withMemoryId(filters, 'abc123');

  assert.equal(withId.get(MEMORY_PARAM), 'abc123');
  assert.equal(filters.has(MEMORY_PARAM), false);
});

/* The filter sync rewrites the query string on every keystroke, so the memory param has to
   survive a trip through both halves or opening a memory and then typing would close it. */
test('coexists with the filter params in both directions', () => {
  const filters = { query: 'ridge trail', tags: ['rain', 'trail'], from: '2024-01-01', to: '2025-12-31' };
  const search = '?' + withMemoryId(serializeFilters(filters), 'abc123').toString();

  assert.equal(parseMemoryId(search), 'abc123');
  assert.deepEqual(parseFilters(search), {
    query: 'ridge trail',
    tags: ['rain', 'trail'],
    from: '2024-01-01',
    to: '2025-12-31'
  });
});

test('coexists with the bare sandbox and sw flags', () => {
  const search = '?sandbox&sw&memory=abc123&q=trail';

  assert.equal(parseMemoryId(search), 'abc123');
  assert.equal(parseFilters(search).query, 'trail');
});

test('no id leaves the params exactly as they were', () => {
  for (const id of [null, undefined, '', '   ']) {
    const params = withMemoryId(serializeFilters({ query: 'trail' }), id);
    assert.equal(params.toString(), 'q=trail');
  }
});

/* Closing the detail view rewrites the URL without the param, which is the same call with
   nothing to write. An id already in there has to come off rather than be left behind. */
test('writing no id removes an id that was already there', () => {
  const params = withMemoryId(new URLSearchParams('memory=abc123&q=trail'), null);

  assert.equal(params.has(MEMORY_PARAM), false);
  assert.equal(params.get('q'), 'trail');
});

test('writing an id replaces one that was already there rather than repeating it', () => {
  const params = withMemoryId(new URLSearchParams('memory=old&q=trail'), 'new');

  assert.deepEqual(params.getAll(MEMORY_PARAM), ['new']);
});

test('the id is written last, so an unfiltered detail view is a short URL', () => {
  assert.equal(withMemoryId(serializeFilters({}), 'abc123').toString(), 'memory=abc123');
});
