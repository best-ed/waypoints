import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createFilterState } from '../../src/js/filters/filter-state.js';

function setup() {
  const listenerErrors = [];
  const filters = createFilterState({ onListenerError: (error) => listenerErrors.push(error) });
  return { filters, listenerErrors };
}

test('starts with no tags and no range', () => {
  const { filters } = setup();
  const value = filters.getFilters();

  assert.deepEqual(value.tags, []);
  assert.equal(value.from, null);
  assert.equal(value.to, null);
});

test('sets tags', () => {
  const { filters } = setup();
  filters.setTags(['trail', 'view']);

  assert.deepEqual(filters.getFilters().tags, ['trail', 'view']);
});

test('normalizes tags to lowercase, trimmed and deduped', () => {
  const { filters } = setup();
  filters.setTags([' Trail ', 'TRAIL', 'view', '', '   ', 42, null]);

  assert.deepEqual(filters.getFilters().tags, ['trail', 'view']);
});

/* Sorted so the same selection compares equal whatever order it was clicked in. */
test('keeps tags sorted regardless of selection order', () => {
  const { filters } = setup();

  filters.setTags(['view', 'trail', 'sunset']);
  assert.deepEqual(filters.getFilters().tags, ['sunset', 'trail', 'view']);
});

test('toggles a tag on and off', () => {
  const { filters } = setup();

  filters.toggleTag('trail');
  assert.deepEqual(filters.getFilters().tags, ['trail']);
  assert.equal(filters.hasTag('trail'), true);

  filters.toggleTag('trail');
  assert.deepEqual(filters.getFilters().tags, []);
  assert.equal(filters.hasTag('trail'), false);
});

test('toggling normalizes the tag first', () => {
  const { filters } = setup();

  filters.toggleTag(' Trail ');
  assert.deepEqual(filters.getFilters().tags, ['trail']);

  filters.toggleTag('TRAIL');
  assert.deepEqual(filters.getFilters().tags, []);
});

test('ignores toggling a blank tag', () => {
  const { filters } = setup();
  let count = 0;
  filters.subscribe(() => count++);

  for (const value of ['', '   ', null, undefined, 42]) {
    filters.toggleTag(value);
  }

  assert.deepEqual(filters.getFilters().tags, []);
  assert.equal(count, 0);
});

test('sets a date range', () => {
  const { filters } = setup();
  filters.setDateRange({ from: '2025-01-01', to: '2025-12-31' });

  const value = filters.getFilters();
  assert.equal(value.from, '2025-01-01');
  assert.equal(value.to, '2025-12-31');
});

test('accepts an open-ended range at either end', () => {
  const { filters } = setup();

  filters.setDateRange({ from: '2025-01-01' });
  assert.equal(filters.getFilters().from, '2025-01-01');
  assert.equal(filters.getFilters().to, null);

  filters.setDateRange({ to: '2025-12-31' });
  assert.equal(filters.getFilters().from, null);
  assert.equal(filters.getFilters().to, '2025-12-31');
});

test('notifies on a tag or range change', () => {
  const { filters } = setup();
  const seen = [];
  filters.subscribe((value) => seen.push(value));

  filters.toggleTag('trail');
  filters.setDateRange({ from: '2025-01-01' });

  assert.equal(seen.length, 2);
  assert.deepEqual(seen[0].tags, ['trail']);
  assert.equal(seen[1].from, '2025-01-01');
});

test('does not notify when the tags have not changed', () => {
  const { filters } = setup();
  let count = 0;
  filters.subscribe(() => count++);

  filters.setTags(['trail', 'view']);
  assert.equal(count, 1);

  filters.setTags(['view', 'trail']);
  filters.setTags(['TRAIL', 'View']);
  assert.equal(count, 1, 'the same set in another order is not a change');
});

test('does not notify when the range has not changed', () => {
  const { filters } = setup();
  let count = 0;
  filters.subscribe(() => count++);

  filters.setDateRange({ from: '2025-01-01', to: '2025-12-31' });
  assert.equal(count, 1);

  filters.setDateRange({ from: '2025-01-01', to: '2025-12-31' });
  assert.equal(count, 1);
});

test('hands out a copy of the tags, not the live array', () => {
  const { filters } = setup();
  filters.setTags(['trail']);

  filters.getFilters().tags.push('injected');

  assert.deepEqual(filters.getFilters().tags, ['trail']);
});

/* A tag with no memories left has no chip, so it could never be deselected by hand. */
test('prunes tags that no memory carries any more', () => {
  const { filters } = setup();
  filters.setTags(['trail', 'view', 'sunset']);

  filters.pruneTags(['trail', 'sunset']);

  assert.deepEqual(filters.getFilters().tags, ['sunset', 'trail']);
});

test('pruning notifies only when something was actually dropped', () => {
  const { filters } = setup();
  filters.setTags(['trail', 'view']);

  let count = 0;
  filters.subscribe(() => count++);

  filters.pruneTags(['trail', 'view', 'sunset']);
  assert.equal(count, 0, 'nothing to drop');

  filters.pruneTags(['trail']);
  assert.equal(count, 1);
  assert.deepEqual(filters.getFilters().tags, ['trail']);
});

test('pruning against nothing clears every tag', () => {
  const { filters } = setup();
  filters.setTags(['trail', 'view']);

  filters.pruneTags([]);

  assert.deepEqual(filters.getFilters().tags, []);
});

test('clear resets every dimension at once', () => {
  const { filters } = setup();
  filters.setQuery('sunset');
  filters.setTags(['trail']);
  filters.setDateRange({ from: '2025-01-01', to: '2025-12-31' });

  filters.clear();

  assert.deepEqual(filters.getFilters(), { query: '', tags: [], from: null, to: null });
});
