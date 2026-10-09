import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  countActiveDimensions,
  dateRangeLabel,
  describeActiveFilters,
  monthLabel
} from '../../src/js/filters/describe-filters.js';

const filters = (overrides = {}) => ({ query: '', tags: [], from: null, to: null, ...overrides });

/* ------------------------------------------------------------------ labels */

test('a month label is built from the string, never through a Date', () => {
  assert.equal(monthLabel('2021-03-04'), 'Mar 2021');
  assert.equal(monthLabel('2023-12-31'), 'Dec 2023');
  /* The one that a Date would get wrong for anyone behind UTC. */
  assert.equal(monthLabel('2021-01-01'), 'Jan 2021');
});

test('a label is refused rather than guessed at', () => {
  for (const value of ['', 'nonsense', '2021-3-4', '20210304', '2021-13-01', null, 42, {}]) {
    assert.equal(monthLabel(value), null, JSON.stringify(value));
  }
});

test('a range reads as a range', () => {
  assert.equal(dateRangeLabel('2021-03-04', '2023-06-30'), 'Mar 2021 to Jun 2023');
});

test('one open end says which end it is', () => {
  assert.equal(dateRangeLabel('2021-03-04', null), 'From Mar 2021');
  assert.equal(dateRangeLabel(null, '2023-06-30'), 'Up to Jun 2023');
});

test('a range inside one month is that month, not a range to itself', () => {
  assert.equal(dateRangeLabel('2021-03-04', '2021-03-28'), 'Mar 2021');
});

test('no dates is no label', () => {
  assert.equal(dateRangeLabel(null, null), null);
  assert.equal(dateRangeLabel('nonsense', 'also nonsense'), null);
});

/* ------------------------------------------------------------------- chips */

test('nothing active makes no chips', () => {
  assert.deepEqual(describeActiveFilters(filters()), []);
});

test('the search gets no chip, because the box is already showing it', () => {
  assert.deepEqual(describeActiveFilters(filters({ query: 'ridge' })), []);
});

test('one chip per tag, in the order they are held', () => {
  const chips = describeActiveFilters(filters({ tags: ['trail', 'rain'] }));

  assert.deepEqual(chips.map((chip) => chip.label), ['trail', 'rain']);
  assert.deepEqual(chips.map((chip) => chip.kind), ['tag', 'tag']);
});

test('every chip carries an accessible label naming what it removes', () => {
  const chips = describeActiveFilters(filters({ tags: ['trail'], from: '2021-03-04', to: '2023-06-30' }));

  assert.deepEqual(
    chips.map((chip) => chip.removeLabel),
    ['Remove filter: trail', 'Remove filter: Mar 2021 to Jun 2023']
  );
});

test('removing a tag chip leaves the other tags alone', () => {
  const chips = describeActiveFilters(filters({ tags: ['trail', 'rain', 'view'] }));
  const rain = chips.find((chip) => chip.label === 'rain');

  assert.deepEqual(rain.remove, { tags: ['trail', 'view'] });
});

test('removing the date chip clears both ends', () => {
  /* The chip stands for the range, not for one end of it. */
  const [chip] = describeActiveFilters(filters({ from: '2021-03-04', to: '2023-06-30' }));

  assert.deepEqual(chip.remove, { from: null, to: null });
});

test('the date chip appears with only one end set', () => {
  const [chip] = describeActiveFilters(filters({ from: '2021-03-04' }));

  assert.equal(chip.label, 'From Mar 2021');
  assert.deepEqual(chip.remove, { from: null, to: null });
});

test('chip ids are stable and distinct, so a keyed render can use them', () => {
  const chips = describeActiveFilters(filters({ tags: ['trail', 'rain'], from: '2021-03-04' }));
  const ids = chips.map((chip) => chip.id);

  assert.deepEqual(ids, ['tag:trail', 'tag:rain', 'dates']);
  assert.equal(new Set(ids).size, ids.length);
});

test('a blank or non-string tag makes no chip', () => {
  const chips = describeActiveFilters({ tags: ['trail', '', '   ', null, 7] });

  assert.deepEqual(chips.map((chip) => chip.label), ['trail']);
});

test('junk in place of a filter state is survived', () => {
  for (const value of [null, undefined, 'nope', 42, []]) {
    assert.deepEqual(describeActiveFilters(value), [], JSON.stringify(value));
  }
});

/* -------------------------------------------------------------- the badge */

test('the badge counts dimensions, not values', () => {
  assert.equal(countActiveDimensions(filters()), 0);
  assert.equal(countActiveDimensions(filters({ query: 'ridge' })), 1);
  assert.equal(countActiveDimensions(filters({ tags: ['a', 'b', 'c'] })), 1);
  assert.equal(countActiveDimensions(filters({ from: '2021-03-04' })), 1);
  assert.equal(countActiveDimensions(filters({ from: '2021-03-04', to: '2023-06-30' })), 1);
});

test('the badge includes the search even though it has no chip', () => {
  /* It says how much is narrowing the list, and a typed query narrows it. */
  assert.equal(countActiveDimensions(filters({ query: 'ridge', tags: ['trail'], to: '2023-06-30' })), 3);
});

test('whitespace is not a query', () => {
  assert.equal(countActiveDimensions(filters({ query: '   ' })), 0);
});

test('junk counts as nothing active', () => {
  for (const value of [null, undefined, 'nope', 42]) {
    assert.equal(countActiveDimensions(value), 0, JSON.stringify(value));
  }
});
