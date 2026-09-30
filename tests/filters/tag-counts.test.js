import { test } from 'node:test';
import assert from 'node:assert/strict';

import { tagCounts, allTags } from '../../src/js/filters/tag-counts.js';

function memory(id, tags, date = '2025-06-15', overrides = {}) {
  return { id, title: id, note: '', placeName: '', tags, date, ...overrides };
}

const LIBRARY = [
  memory('a', ['trail', 'view'], '2025-03-04'),
  memory('b', ['view'], '2025-06-15'),
  memory('c', ['food'], '2025-09-20'),
  memory('d', ['trail', 'food'], '2024-12-31'),
  memory('e', [], '2025-01-01')
];

test('counts every tag across every memory when nothing is filtered', () => {
  const counts = tagCounts(LIBRARY, {});

  assert.deepEqual(counts, [
    { tag: 'food', count: 2 },
    { tag: 'trail', count: 2 },
    { tag: 'view', count: 2 }
  ]);
});

test('sorts by count descending', () => {
  const counts = tagCounts([...LIBRARY, memory('f', ['view'], '2025-05-05')], {});

  assert.equal(counts[0].tag, 'view');
  assert.equal(counts[0].count, 3);
});

test('breaks a count tie alphabetically', () => {
  const counts = tagCounts(LIBRARY, {});

  assert.deepEqual(counts.map((entry) => entry.tag), ['food', 'trail', 'view']);
});

/* The point of faceting: selecting a tag must not collapse the other counts to what is
   already showing, or the chips would tell you nothing about what else you could pick. */
test('ignores the tag filter itself when counting', () => {
  const withTrail = tagCounts(LIBRARY, { tags: ['trail'] });

  assert.deepEqual(withTrail, tagCounts(LIBRARY, {}), 'counts are unchanged by a tag selection');
});

test('narrows counts by the date range', () => {
  const counts = tagCounts(LIBRARY, { from: '2025-01-01' });

  assert.deepEqual(counts, [
    { tag: 'view', count: 2 },
    { tag: 'food', count: 1 },
    { tag: 'trail', count: 1 }
  ]);
});

test('narrows counts by a text query', () => {
  const titled = [
    memory('hike', ['trail', 'view'], '2025-03-04', { title: 'Morning hike' }),
    memory('drive', ['view'], '2025-06-15', { title: 'Sunset drive' }),
    memory('market', ['food'], '2025-09-20', { title: 'Market run' })
  ];

  const counts = tagCounts(titled, { query: 'hike' });

  assert.deepEqual(counts, [
    { tag: 'trail', count: 1 },
    { tag: 'view', count: 1 }
  ]);
});

test('narrows counts by query and range together while ignoring tags', () => {
  const counts = tagCounts(LIBRARY, { tags: ['food'], from: '2025-03-04', to: '2025-09-20' });

  assert.deepEqual(counts, [
    { tag: 'food', count: 1 },
    { tag: 'trail', count: 1 },
    { tag: 'view', count: 2 }
  ].sort((a, b) => (b.count === a.count ? a.tag.localeCompare(b.tag) : b.count - a.count)));
});

test('a tag can fall to no matches once the range excludes it', () => {
  const counts = tagCounts(LIBRARY, { from: '2025-09-01' });

  assert.deepEqual(counts, [{ tag: 'food', count: 1 }]);
  assert.ok(!counts.some((entry) => entry.tag === 'trail'), 'trail drops out entirely');
});

test('returns nothing when no memory matches the other filters', () => {
  assert.deepEqual(tagCounts(LIBRARY, { from: '2030-01-01' }), []);
});

test('returns nothing for an empty library', () => {
  assert.deepEqual(tagCounts([], {}), []);
});

test('counts a duplicated tag on one memory only once', () => {
  const counts = tagCounts([memory('dup', ['trail', 'trail', 'trail'])], {});

  assert.deepEqual(counts, [{ tag: 'trail', count: 1 }]);
});

test('skips memories whose tags are not an array', () => {
  const odd = [memory('ok', ['trail']), memory('bad', 'trail'), memory('nulled', null)];

  assert.deepEqual(tagCounts(odd, {}), [{ tag: 'trail', count: 1 }]);
});

test('survives arguments that are not arrays', () => {
  assert.deepEqual(tagCounts(null, {}), []);
  assert.deepEqual(tagCounts(undefined, {}), []);
});

test('allTags lists every distinct tag, sorted', () => {
  assert.deepEqual(allTags(LIBRARY), ['food', 'trail', 'view']);
});

test('allTags ignores the filters entirely', () => {
  assert.deepEqual(allTags([memory('a', ['zebra']), memory('b', ['apple'])]), ['apple', 'zebra']);
});

test('allTags returns nothing for an empty or odd library', () => {
  assert.deepEqual(allTags([]), []);
  assert.deepEqual(allTags(null), []);
  assert.deepEqual(allTags([memory('bad', 'trail')]), []);
});
