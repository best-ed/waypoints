import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isFormDirty } from '../../src/js/ui/form-dirty.js';

const BASE = {
  title: 'Ridge trail',
  date: '2025-03-04',
  note: 'Walked up from the gate.',
  placeName: 'Ngong Hills',
  tags: ['trail', 'rain'],
  photoIds: ['p1', 'p2', 'p3']
};

const changed = (patch) => isFormDirty(BASE, { ...BASE, ...patch });

test('an untouched form is clean', () => {
  assert.equal(isFormDirty(BASE, { ...BASE }), false);
});

test('a change to any text field is a change', () => {
  assert.equal(changed({ title: 'Ridge trail again' }), true);
  assert.equal(changed({ date: '2025-03-05' }), true);
  assert.equal(changed({ note: 'Walked up from the gate. Twice.' }), true);
  assert.equal(changed({ placeName: 'Ngong Hills, Kajiado' }), true);
});

/* The comparison goes through the store's own normalizer, so it answers the question that
   matters: would saving this write anything different? Asking "discard your changes?" over a
   difference that could never reach the record teaches people to dismiss the question. */
test('whitespace that the store would trim away is not a change', () => {
  assert.equal(changed({ title: '  Ridge trail  ' }), false);
  assert.equal(changed({ note: 'Walked up from the gate.  ' }), false);
  assert.equal(changed({ placeName: ' Ngong Hills' }), false);
});

test('a tag typed in a different case is not a change', () => {
  assert.equal(changed({ tags: ['Trail', 'RAIN'] }), false);
});

test('a repeated tag is not a change, because only one of them would be stored', () => {
  assert.equal(changed({ tags: ['trail', 'rain', 'trail'] }), false);
});

test('adding, removing or reordering tags is a change', () => {
  assert.equal(changed({ tags: ['trail', 'rain', 'cloud'] }), true);
  assert.equal(changed({ tags: ['trail'] }), true);
  assert.equal(changed({ tags: ['rain', 'trail'] }), true);
});

/* Order is the whole of what photoIds says, because the first one is the cover. */
test('reordering photos is a change', () => {
  assert.equal(changed({ photoIds: ['p2', 'p1', 'p3'] }), true);
});

test('making a different photo the cover is a change', () => {
  assert.equal(changed({ photoIds: ['p3', 'p1', 'p2'] }), true);
});

test('adding or removing a photo is a change', () => {
  assert.equal(changed({ photoIds: ['p1', 'p2', 'p3', 'p4'] }), true);
  assert.equal(changed({ photoIds: ['p1', 'p2'] }), true);
});

test('a form opened on nothing and left alone is clean', () => {
  const empty = { title: '', date: '2025-03-04', note: '', placeName: '', tags: [], photoIds: [] };
  assert.equal(isFormDirty(empty, { ...empty }), false);
  assert.equal(isFormDirty(empty, { ...empty, title: 'Something' }), true);
});

test('missing sides are treated as empty rather than throwing', () => {
  assert.equal(isFormDirty(null, {}), false);
  assert.equal(isFormDirty(undefined, undefined), false);
  assert.equal(isFormDirty({}, { title: 'New' }), true);
});

/* A pending photo already has an id before it is written, which is what lets an unsaved
   addition be compared against the list the form opened with. */
test('an unsaved photo counts even though nothing is in the database yet', () => {
  const initial = { ...BASE, photoIds: [] };
  assert.equal(isFormDirty(initial, { ...initial, photoIds: ['pending-1'] }), true);
});
