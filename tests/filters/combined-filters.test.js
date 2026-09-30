import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyFilters, isFilterActive } from '../../src/js/filters/apply-filters.js';
import { createFilterState } from '../../src/js/filters/filter-state.js';

function memory(id, overrides = {}) {
  return {
    id,
    title: 'A memory',
    note: '',
    placeName: '',
    tags: [],
    date: '2025-06-15',
    ...overrides
  };
}

const LIBRARY = [
  memory('hike', { title: 'Morning hike', tags: ['trail', 'view'], date: '2025-03-04' }),
  memory('sunset', { title: 'Sunset drive', tags: ['view'], date: '2025-06-15' }),
  memory('market', { title: 'Market run', tags: ['food'], date: '2025-09-20' }),
  memory('camp', { title: 'Camping trip', tags: ['trail', 'food'], date: '2024-12-31' }),
  memory('plain', { title: 'Nothing tagged', tags: [], date: '2025-01-01' })
];

function ids(results) {
  return results.map((item) => item.id);
}

test('no filters returns everything', () => {
  assert.deepEqual(ids(applyFilters(LIBRARY, {})), ids(LIBRARY));
});

/* ANY within tags: one selected tag on the memory is enough. */
test('a single tag keeps every memory carrying it', () => {
  assert.deepEqual(ids(applyFilters(LIBRARY, { tags: ['trail'] })), ['hike', 'camp']);
});

test('two tags give the union, not the intersection', () => {
  const result = ids(applyFilters(LIBRARY, { tags: ['trail', 'food'] }));

  assert.deepEqual(result, ['hike', 'market', 'camp']);
  assert.ok(result.includes('market'), 'food only still matches');
  assert.ok(result.includes('hike'), 'trail only still matches');
});

test('an untagged memory never matches a tag filter', () => {
  assert.ok(!ids(applyFilters(LIBRARY, { tags: ['trail', 'view', 'food'] })).includes('plain'));
});

test('no tags selected means no tag narrowing', () => {
  assert.deepEqual(ids(applyFilters(LIBRARY, { tags: [] })), ids(LIBRARY));
});

test('a tag nothing carries returns nothing', () => {
  assert.deepEqual(applyFilters(LIBRARY, { tags: ['nonexistent'] }), []);
});

test('a from bound is inclusive', () => {
  const result = ids(applyFilters(LIBRARY, { from: '2025-03-04' }));

  assert.ok(result.includes('hike'), 'the memory exactly on the bound is kept');
  assert.deepEqual(result, ['hike', 'sunset', 'market']);
});

test('a to bound is inclusive', () => {
  const result = ids(applyFilters(LIBRARY, { to: '2025-03-04' }));

  assert.ok(result.includes('hike'));
  assert.deepEqual(result, ['hike', 'camp', 'plain']);
});

test('both bounds together are inclusive at each end', () => {
  const result = ids(applyFilters(LIBRARY, { from: '2025-01-01', to: '2025-06-15' }));

  assert.deepEqual(result, ['hike', 'sunset', 'plain']);
});

test('an open-ended range only constrains the end it has', () => {
  assert.deepEqual(ids(applyFilters(LIBRARY, { from: '2025-09-20' })), ['market']);
  assert.deepEqual(ids(applyFilters(LIBRARY, { to: '2024-12-31' })), ['camp']);
});

test('a range covering nothing returns nothing', () => {
  assert.deepEqual(applyFilters(LIBRARY, { from: '2026-01-01', to: '2026-12-31' }), []);
});

test('a single day range keeps only that day', () => {
  assert.deepEqual(ids(applyFilters(LIBRARY, { from: '2025-06-15', to: '2025-06-15' })), ['sunset']);
});

/* Compared as strings: no Date is built, so this holds regardless of timezone. */
test('date comparison spans a year boundary correctly', () => {
  const result = ids(applyFilters(LIBRARY, { from: '2024-12-01', to: '2025-01-31' }));

  assert.deepEqual(result, ['camp', 'plain']);
});

test('facets combine with AND', () => {
  const result = ids(applyFilters(LIBRARY, { tags: ['trail'], from: '2025-01-01' }));

  assert.deepEqual(result, ['hike'], 'camp carries trail but falls outside the range');
});

test('a text query narrows a tag union further', () => {
  const union = ids(applyFilters(LIBRARY, { tags: ['trail', 'food'] }));
  assert.equal(union.length, 3);

  const narrowed = ids(applyFilters(LIBRARY, { tags: ['trail', 'food'], query: 'camping' }));
  assert.deepEqual(narrowed, ['camp']);
});

test('all three facets together', () => {
  const result = ids(
    applyFilters(LIBRARY, {
      query: 'hike',
      tags: ['trail', 'view'],
      from: '2025-01-01',
      to: '2025-12-31'
    })
  );

  assert.deepEqual(result, ['hike']);
});

test('conflicting facets return nothing', () => {
  assert.deepEqual(applyFilters(LIBRARY, { tags: ['food'], query: 'sunset' }), []);
});

test('excluding a facet by name leaves the others applied', () => {
  const withTags = ids(applyFilters(LIBRARY, { tags: ['food'], from: '2025-01-01' }));
  assert.deepEqual(withTags, ['market']);

  /* With the tag filter excluded only the date applies, so the untagged memory comes
     back too. That is the point: this is the set the tag counts are computed over. */
  const withoutTagFilter = ids(
    applyFilters(LIBRARY, { tags: ['food'], from: '2025-01-01' }, { except: 'tags' })
  );
  assert.deepEqual(withoutTagFilter, ['hike', 'sunset', 'market', 'plain']);
});

test('a memory with no date never matches a range', () => {
  const undated = [memory('undated', { date: '' }), memory('nulled', { date: null })];

  assert.deepEqual(applyFilters(undated, { from: '2020-01-01' }), []);
  assert.deepEqual(applyFilters(undated, { to: '2030-01-01' }), []);
  assert.equal(applyFilters(undated, {}).length, 2, 'but is kept when no range is set');
});

test('a memory with tags that are not an array never matches a tag filter', () => {
  const odd = [memory('odd', { tags: 'trail' }), memory('nulled', { tags: null })];

  assert.deepEqual(applyFilters(odd, { tags: ['trail'] }), []);
});

test('isFilterActive reports each dimension', () => {
  assert.equal(isFilterActive({}), false);
  assert.equal(isFilterActive({ query: '', tags: [], from: null, to: null }), false);
  assert.equal(isFilterActive({ query: 'sunset' }), true);
  assert.equal(isFilterActive({ tags: ['trail'] }), true);
  assert.equal(isFilterActive({ from: '2025-01-01' }), true);
  assert.equal(isFilterActive({ to: '2025-12-31' }), true);
});

test('filter state reports active for any single dimension', () => {
  for (const apply of [
    (f) => f.setQuery('sunset'),
    (f) => f.toggleTag('trail'),
    (f) => f.setDateRange({ from: '2025-01-01' }),
    (f) => f.setDateRange({ to: '2025-12-31' })
  ]) {
    const filters = createFilterState();
    assert.equal(filters.isActive(), false);

    apply(filters);
    assert.equal(filters.isActive(), true);
  }
});

test('state and applyFilters agree end to end', () => {
  const filters = createFilterState();
  filters.toggleTag('trail');
  filters.setDateRange({ from: '2025-01-01' });

  assert.deepEqual(ids(applyFilters(LIBRARY, filters.getFilters())), ['hike']);
});
