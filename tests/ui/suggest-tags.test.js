import { test } from 'node:test';
import assert from 'node:assert/strict';

import { suggestTags, MAX_SUGGESTIONS } from '../../src/js/ui/suggest-tags.js';

const LIBRARY = ['coast', 'country', 'rain', 'trail', 'train', 'retrain'];

test('prefix matches come before substring matches', () => {
  /* "trail" and "train" start with it; "retrain" only contains it. */
  assert.deepEqual(suggestTags('tra', LIBRARY), ['trail', 'train', 'retrain']);
});

test('within a group the library order is kept, so the list does not reshuffle as you type', () => {
  assert.deepEqual(suggestTags('c', LIBRARY), ['coast', 'country']);
  assert.deepEqual(suggestTags('co', LIBRARY), ['coast', 'country']);
});

test('a tag already on the memory is not offered again', () => {
  assert.deepEqual(suggestTags('tra', LIBRARY, ['trail']), ['train', 'retrain']);
  assert.deepEqual(suggestTags('tra', LIBRARY, ['trail', 'train', 'retrain']), []);
});

/* The same folding the search uses. Without it the library quietly grows two spellings of the
   same word, which is the thing a tag is supposed to prevent. */
test('matching ignores diacritics in both directions', () => {
  assert.deepEqual(suggestTags('nairobi', ['nairóbi']), ['nairóbi']);
  assert.deepEqual(suggestTags('nairóbi', ['nairobi']), ['nairobi']);
  assert.deepEqual(suggestTags('o', ['Ngong'], ['ngong']), []);
});

test('matching ignores case', () => {
  assert.deepEqual(suggestTags('TRA', LIBRARY), ['trail', 'train', 'retrain']);
  assert.deepEqual(suggestTags('tra', ['Trail']), ['Trail']);
});

/* The first thing anyone wants from a tag field is a reminder of what they have been calling
   things, so an empty input is not an empty list. */
test('an empty input offers what is already in the library', () => {
  assert.deepEqual(suggestTags('', LIBRARY), LIBRARY);
  assert.deepEqual(suggestTags('   ', LIBRARY), LIBRARY);
  assert.deepEqual(suggestTags('', LIBRARY, ['coast', 'rain']), ['country', 'trail', 'train', 'retrain']);
});

test('nothing matching gives nothing', () => {
  assert.deepEqual(suggestTags('zebra', LIBRARY), []);
});

test('the list is capped', () => {
  const many = Array.from({ length: 40 }, (unused, index) => 'tag' + index);

  assert.equal(suggestTags('tag', many).length, MAX_SUGGESTIONS);
  assert.equal(suggestTags('', many).length, MAX_SUGGESTIONS);
  assert.equal(suggestTags('tag', many, [], { limit: 3 }).length, 3);
});

test('junk arguments give an empty list rather than throwing', () => {
  for (const tags of [null, undefined, 'trail', 42]) {
    assert.deepEqual(suggestTags('tra', tags), []);
  }

  assert.deepEqual(suggestTags(null, LIBRARY), LIBRARY);
  assert.deepEqual(suggestTags('tra', LIBRARY, null), ['trail', 'train', 'retrain']);
});

test('blank entries in the library are never offered', () => {
  assert.deepEqual(suggestTags('', ['', '  ', 'trail']), ['trail']);
  assert.deepEqual(suggestTags('t', ['', '  ', 'trail']), ['trail']);
});
