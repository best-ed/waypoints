import { test } from 'node:test';
import assert from 'node:assert/strict';

import { matchesQuery, normalizeText, parseQuery } from '../../src/js/filters/match-memory.js';

function memory(overrides = {}) {
  return {
    title: 'Sunset at the pier',
    note: 'Cold wind, worth it.',
    placeName: 'Nairobi',
    tags: ['trail', 'view'],
    ...overrides
  };
}

test('lowercases and collapses whitespace', () => {
  assert.equal(normalizeText('  Sunset   AT the  Pier '), 'sunset at the pier');
  assert.equal(normalizeText('line\nbreak\ttab'), 'line break tab');
});

test('strips diacritics down to base letters', () => {
  assert.equal(normalizeText('Nairóbi'), 'nairobi');
  assert.equal(normalizeText('café'), 'cafe');
  assert.equal(normalizeText('Ångström'), 'angstrom');
  assert.equal(normalizeText('naïve résumé'), 'naive resume');
});

test('leaves text without diacritics alone', () => {
  assert.equal(normalizeText('nairobi'), 'nairobi');
});

test('returns an empty string for values that are not strings', () => {
  for (const value of [null, undefined, 42, {}, []]) {
    assert.equal(normalizeText(value), '');
  }
});

test('splits a query into normalized terms', () => {
  assert.deepEqual(parseQuery('Rift  Valley'), ['rift', 'valley']);
  assert.deepEqual(parseQuery('  Café '), ['cafe']);
});

test('parses an empty query into no terms', () => {
  for (const query of ['', '   ', '\n', null, undefined]) {
    assert.deepEqual(parseQuery(query), []);
  }
});

test('an empty query matches everything', () => {
  for (const query of ['', '   ', null, undefined]) {
    assert.equal(matchesQuery(memory(), query), true);
  }
});

test('matches on the title', () => {
  assert.equal(matchesQuery(memory(), 'sunset'), true);
  assert.equal(matchesQuery(memory(), 'pier'), true);
});

test('matches on the note', () => {
  assert.equal(matchesQuery(memory(), 'wind'), true);
});

test('matches on the place name', () => {
  assert.equal(matchesQuery(memory(), 'nairobi'), true);
});

test('matches on a tag', () => {
  assert.equal(matchesQuery(memory(), 'trail'), true);
  assert.equal(matchesQuery(memory(), 'view'), true);
});

test('does not match text that is not there', () => {
  assert.equal(matchesQuery(memory(), 'mombasa'), false);
});

/* The AND rule: both terms must be present, but they may come from different fields. */
test('requires every term to match, across any field', () => {
  assert.equal(matchesQuery(memory(), 'sunset nairobi'), true);
  assert.equal(matchesQuery(memory(), 'pier trail'), true);
  assert.equal(matchesQuery(memory(), 'sunset mombasa'), false);
  assert.equal(matchesQuery(memory(), 'mombasa sunset'), false);
});

test('matches three terms from three different fields', () => {
  assert.equal(matchesQuery(memory(), 'sunset wind trail'), true);
});

test('ignores the order of terms', () => {
  assert.equal(matchesQuery(memory(), 'nairobi sunset'), true);
  assert.equal(matchesQuery(memory(), 'sunset nairobi'), true);
});

test('matches a partial word', () => {
  assert.equal(matchesQuery(memory(), 'sun'), true);
  assert.equal(matchesQuery(memory(), 'nair'), true);
});

test('ignores case in both the memory and the query', () => {
  assert.equal(matchesQuery(memory({ title: 'SUNSET' }), 'sunset'), true);
  assert.equal(matchesQuery(memory(), 'SUNSET'), true);
});

test('matches an accented query against unaccented text and back', () => {
  assert.equal(matchesQuery(memory({ placeName: 'Nairóbi' }), 'nairobi'), true);
  assert.equal(matchesQuery(memory({ placeName: 'Nairobi' }), 'nairóbi'), true);
  assert.equal(matchesQuery(memory({ title: 'Café stop' }), 'cafe'), true);
  assert.equal(matchesQuery(memory({ title: 'Cafe stop' }), 'café'), true);
});

test('collapses extra spaces in the query', () => {
  assert.equal(matchesQuery(memory(), '  sunset    nairobi  '), true);
});

test('handles a memory with empty optional fields', () => {
  const sparse = { title: 'Just a title', note: '', placeName: '', tags: [] };

  assert.equal(matchesQuery(sparse, 'title'), true);
  assert.equal(matchesQuery(sparse, 'nairobi'), false);
});

test('handles a memory missing fields entirely', () => {
  assert.equal(matchesQuery({ title: 'Only' }, 'only'), true);
  assert.equal(matchesQuery({}, 'anything'), false);
  assert.equal(matchesQuery({}, ''), true);
});

test('survives a memory that is not an object', () => {
  for (const value of [null, undefined, 'memory', 42]) {
    assert.equal(matchesQuery(value, 'sunset'), false);
    assert.equal(matchesQuery(value, ''), true);
  }
});

test('does not match across a field boundary as one word', () => {
  const sparse = { title: 'rift', note: '', placeName: 'valley', tags: [] };

  assert.equal(matchesQuery(sparse, 'rift valley'), true);
  assert.equal(matchesQuery(sparse, 'riftvalley'), false);
});
