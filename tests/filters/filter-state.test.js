import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createFilterState } from '../../src/js/filters/filter-state.js';
import { applyFilters, isFilterActive, EMPTY_FILTERS } from '../../src/js/filters/apply-filters.js';

function setup() {
  const listenerErrors = [];
  const filters = createFilterState({ onListenerError: (error) => listenerErrors.push(error) });
  return { filters, listenerErrors };
}

function memory(id, overrides = {}) {
  return {
    id,
    title: 'Sunset at the pier',
    note: '',
    placeName: 'Nairobi',
    tags: [],
    ...overrides
  };
}

test('starts with an empty query', () => {
  const { filters } = setup();
  assert.deepEqual(filters.getFilters(), { query: '', tags: [], from: null, to: null });
  assert.equal(filters.isActive(), false);
});

test('sets the query', () => {
  const { filters } = setup();
  filters.setQuery('sunset');

  assert.equal(filters.getFilters().query, 'sunset');
  assert.equal(filters.isActive(), true);
});

test('a whitespace only query is not active', () => {
  const { filters } = setup();
  filters.setQuery('   ');

  assert.equal(filters.isActive(), false);
});

test('clears back to empty', () => {
  const { filters } = setup();
  filters.setQuery('sunset');
  filters.clear();

  assert.deepEqual(filters.getFilters(), { query: '', tags: [], from: null, to: null });
  assert.equal(filters.isActive(), false);
});

test('coerces a non-string query to empty', () => {
  const { filters } = setup();
  for (const value of [null, undefined, 42, {}]) {
    filters.setQuery('sunset');
    filters.setQuery(value);
    assert.equal(filters.getFilters().query, '');
  }
});

test('notifies subscribers with the new filters', () => {
  const { filters } = setup();
  const seen = [];
  filters.subscribe((value) => seen.push(value.query));

  filters.setQuery('sunset');
  filters.setQuery('pier');
  filters.clear();

  assert.deepEqual(seen, ['sunset', 'pier', '']);
});

/* A debounced input that settles on the same text must not re-render everything. */
test('does not notify when the query has not changed', () => {
  const { filters } = setup();
  let count = 0;
  filters.subscribe(() => count++);

  filters.setQuery('sunset');
  assert.equal(count, 1);

  filters.setQuery('sunset');
  filters.setQuery('sunset');
  assert.equal(count, 1);
});

test('does not notify when clearing an already empty state', () => {
  const { filters } = setup();
  let count = 0;
  filters.subscribe(() => count++);

  filters.clear();
  assert.equal(count, 0);
});

test('hands out a copy, not the live filters', () => {
  const { filters } = setup();
  const snapshot = filters.getFilters();
  snapshot.query = 'tampered';

  assert.equal(filters.getFilters().query, '');
});

test('unsubscribe stops notifications', () => {
  const { filters } = setup();
  let count = 0;
  const unsubscribe = filters.subscribe(() => count++);

  filters.setQuery('a');
  unsubscribe();
  filters.setQuery('b');

  assert.equal(count, 1);
});

test('rejects a subscriber that is not a function', () => {
  const { filters } = setup();
  for (const value of [null, undefined, 'listener', 42]) {
    assert.throws(() => filters.subscribe(value), TypeError);
  }
});

test('a throwing listener does not stop the others', () => {
  const { filters, listenerErrors } = setup();
  let reached = 0;

  filters.subscribe(() => {
    throw new Error('listener blew up');
  });
  filters.subscribe(() => reached++);

  filters.setQuery('sunset');

  assert.equal(reached, 1);
  assert.equal(listenerErrors.length, 1);
});

test('applyFilters returns everything when nothing is filtered', () => {
  const memories = [memory('a'), memory('b')];

  assert.deepEqual(applyFilters(memories, EMPTY_FILTERS).map((m) => m.id), ['a', 'b']);
  assert.deepEqual(applyFilters(memories, {}).map((m) => m.id), ['a', 'b']);
});

test('applyFilters keeps only matching memories', () => {
  const memories = [
    memory('a', { title: 'Sunset at the pier' }),
    memory('b', { title: 'Morning hike', placeName: 'Naivasha' }),
    memory('c', { title: 'Sunset drive', placeName: 'Naivasha' })
  ];

  assert.deepEqual(applyFilters(memories, { query: 'sunset' }).map((m) => m.id), ['a', 'c']);
  assert.deepEqual(applyFilters(memories, { query: 'naivasha' }).map((m) => m.id), ['b', 'c']);
  assert.deepEqual(applyFilters(memories, { query: 'sunset naivasha' }).map((m) => m.id), ['c']);
});

test('applyFilters can return nothing', () => {
  assert.deepEqual(applyFilters([memory('a')], { query: 'mombasa' }), []);
});

test('applyFilters returns a new array and does not mutate the input', () => {
  const memories = [memory('a'), memory('b')];
  const result = applyFilters(memories, EMPTY_FILTERS);

  assert.notEqual(result, memories);
  assert.equal(memories.length, 2);
});

test('applyFilters keeps the order it was given', () => {
  const memories = [memory('c'), memory('a'), memory('b')];

  assert.deepEqual(applyFilters(memories, { query: 'sunset' }).map((m) => m.id), ['c', 'a', 'b']);
});

test('applyFilters survives input that is not an array', () => {
  for (const value of [null, undefined, 'memories', 42]) {
    assert.deepEqual(applyFilters(value, { query: 'sunset' }), []);
  }
});

test('isFilterActive reports whether anything is narrowing the list', () => {
  assert.equal(isFilterActive({ query: '' }), false);
  assert.equal(isFilterActive({ query: '   ' }), false);
  assert.equal(isFilterActive({ query: 'sunset' }), true);
});
