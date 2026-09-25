import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createSelection } from '../../src/js/ui/selection.js';

function setup() {
  const listenerErrors = [];
  const selection = createSelection({ onListenerError: (error) => listenerErrors.push(error) });
  return { selection, listenerErrors };
}

test('starts with nothing selected', () => {
  const { selection } = setup();
  assert.equal(selection.getSelected(), null);
});

test('selects an id', () => {
  const { selection } = setup();
  selection.select('a');
  assert.equal(selection.getSelected(), 'a');
});

test('replaces the previous selection', () => {
  const { selection } = setup();
  selection.select('a');
  selection.select('b');
  assert.equal(selection.getSelected(), 'b');
});

test('clears the selection', () => {
  const { selection } = setup();
  selection.select('a');
  selection.clear();
  assert.equal(selection.getSelected(), null);
});

test('notifies subscribers with the selected id', () => {
  const { selection } = setup();
  const seen = [];
  selection.subscribe((id) => seen.push(id));

  selection.select('a');
  selection.select('b');
  selection.clear();

  assert.deepEqual(seen, ['a', 'b', null]);
});

/* The guard that keeps the list and the map from bouncing a selection back and forth:
   a list click selects, which opens a popup, which selects the same id again. */
test('does not notify when selecting the already selected id', () => {
  const { selection } = setup();
  let count = 0;
  selection.subscribe(() => count++);

  selection.select('a');
  assert.equal(count, 1);

  selection.select('a');
  selection.select('a');
  assert.equal(count, 1);
  assert.equal(selection.getSelected(), 'a');
});

test('does not notify when clearing an empty selection', () => {
  const { selection } = setup();
  let count = 0;
  selection.subscribe(() => count++);

  selection.clear();
  assert.equal(count, 0);

  selection.select('a');
  selection.clear();
  selection.clear();
  assert.equal(count, 2);
});

test('supports several independent subscribers', () => {
  const { selection } = setup();
  let first = 0;
  let second = 0;
  selection.subscribe(() => first++);
  selection.subscribe(() => second++);

  selection.select('a');

  assert.equal(first, 1);
  assert.equal(second, 1);
});

test('unsubscribe stops further notifications', () => {
  const { selection } = setup();
  let count = 0;
  const unsubscribe = selection.subscribe(() => count++);

  selection.select('a');
  unsubscribe();
  selection.select('b');

  assert.equal(count, 1);
  assert.equal(selection.getSelected(), 'b');
});

test('unsubscribing twice is harmless', () => {
  const { selection } = setup();
  let count = 0;
  const unsubscribe = selection.subscribe(() => count++);

  unsubscribe();
  unsubscribe();
  selection.select('a');

  assert.equal(count, 0);
});

test('unsubscribing one listener leaves the others subscribed', () => {
  const { selection } = setup();
  let kept = 0;
  const unsubscribe = selection.subscribe(() => {
    throw new Error('should not run');
  });
  selection.subscribe(() => kept++);

  unsubscribe();
  selection.select('a');

  assert.equal(kept, 1);
});

test('rejects a subscriber that is not a function', () => {
  const { selection } = setup();
  for (const value of [null, undefined, 'listener', 42, {}]) {
    assert.throws(() => selection.subscribe(value), TypeError);
  }
});

test('a throwing listener does not stop the others', () => {
  const { selection, listenerErrors } = setup();
  let reached = 0;

  selection.subscribe(() => {
    throw new Error('listener blew up');
  });
  selection.subscribe(() => reached++);

  selection.select('a');

  assert.equal(reached, 1);
  assert.equal(selection.getSelected(), 'a');
  assert.equal(listenerErrors.length, 1);
  assert.equal(listenerErrors[0].message, 'listener blew up');
});

test('reports whether a given id is selected', () => {
  const { selection } = setup();

  assert.equal(selection.isSelected('a'), false);

  selection.select('a');
  assert.equal(selection.isSelected('a'), true);
  assert.equal(selection.isSelected('b'), false);

  selection.clear();
  assert.equal(selection.isSelected('a'), false);
});

test('does not treat a null id as a match when nothing is selected', () => {
  const { selection } = setup();
  assert.equal(selection.isSelected(null), false);
  assert.equal(selection.isSelected(undefined), false);
});
