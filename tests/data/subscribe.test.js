import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMemoryStore } from '../../src/js/data/memory-store.js';
import { ValidationError, StorageFullError } from '../../src/js/data/errors.js';
import { createFakeStorage, quotaExceededError, tickingNow } from '../helpers/fake-storage.js';

function setup() {
  const storage = createFakeStorage();
  const listenerErrors = [];
  let count = 0;
  const store = createMemoryStore({
    storage,
    now: tickingNow('2025-05-01T10:00:00.000Z'),
    makeId: () => 'id-' + ++count,
    onListenerError: (error) => listenerErrors.push(error)
  });
  return { storage, store, listenerErrors };
}

function input(overrides = {}) {
  return { title: 'Sunset', date: '2025-03-04', lat: -1.2921, lng: 36.8219, ...overrides };
}

test('notifies subscribers when a memory is added', () => {
  const { store } = setup();
  const calls = [];
  store.subscribe((memories) => calls.push(memories));

  store.add(input());

  assert.equal(calls.length, 1);
  assert.equal(calls[0].length, 1);
  assert.equal(calls[0][0].title, 'Sunset');
});

test('notifies on update and remove as well', () => {
  const { store } = setup();
  const added = store.add(input());

  let count = 0;
  store.subscribe(() => count++);

  store.update(added.id, { title: 'Changed' });
  assert.equal(count, 1);

  store.remove(added.id);
  assert.equal(count, 2);
});

test('passes the sorted current list to the listener', () => {
  const { store } = setup();
  const seen = [];
  store.subscribe((memories) => seen.push(memories.map((memory) => memory.title)));

  store.add(input({ title: 'Later', date: '2025-07-01' }));
  store.add(input({ title: 'Earlier', date: '2024-01-01' }));

  assert.deepEqual(seen[0], ['Later']);
  assert.deepEqual(seen[1], ['Earlier', 'Later']);
});

test('supports several independent subscribers', () => {
  const { store } = setup();
  let first = 0;
  let second = 0;
  store.subscribe(() => first++);
  store.subscribe(() => second++);

  store.add(input());

  assert.equal(first, 1);
  assert.equal(second, 1);
});

test('unsubscribe stops further notifications', () => {
  const { store } = setup();
  let count = 0;
  const unsubscribe = store.subscribe(() => count++);

  store.add(input());
  unsubscribe();
  store.add(input({ title: 'Second' }));

  assert.equal(count, 1);
});

test('unsubscribing twice is harmless', () => {
  const { store } = setup();
  let count = 0;
  const unsubscribe = store.subscribe(() => count++);

  unsubscribe();
  unsubscribe();
  store.add(input());

  assert.equal(count, 0);
});

test('unsubscribing one listener leaves the others subscribed', () => {
  const { store } = setup();
  let kept = 0;
  const unsubscribe = store.subscribe(() => {
    throw new Error('should not run');
  });
  store.subscribe(() => kept++);

  unsubscribe();
  store.add(input());

  assert.equal(kept, 1);
});

test('does not notify when validation fails', () => {
  const { store } = setup();
  let count = 0;
  store.subscribe(() => count++);

  assert.throws(() => store.add(input({ title: '' })), ValidationError);
  assert.equal(count, 0);
});

test('does not notify when an update is rejected', () => {
  const { store } = setup();
  const added = store.add(input());

  let count = 0;
  store.subscribe(() => count++);

  assert.throws(() => store.update(added.id, { lat: 999 }), ValidationError);
  assert.throws(() => store.update('missing', { title: 'x' }), /No memory with id/);

  assert.equal(count, 0);
});

test('does not notify when the write fails on a full quota', () => {
  const { storage, store } = setup();
  let count = 0;
  store.subscribe(() => count++);

  storage.failOnSet(quotaExceededError());

  assert.throws(() => store.add(input()), StorageFullError);
  assert.equal(count, 0);
});

test('does not notify when removing an id that is not there', () => {
  const { store } = setup();
  let count = 0;
  store.subscribe(() => count++);

  assert.equal(store.remove('missing'), false);
  assert.equal(count, 0);
});

test('rejects a subscriber that is not a function', () => {
  const { store } = setup();
  for (const value of [null, undefined, 'listener', 42, {}]) {
    assert.throws(() => store.subscribe(value), TypeError);
  }
});

test('a throwing listener does not break the mutation or other listeners', () => {
  const { store, listenerErrors } = setup();
  let reached = 0;

  store.subscribe(() => {
    throw new Error('listener blew up');
  });
  store.subscribe(() => reached++);

  const added = store.add(input());

  assert.equal(reached, 1);
  assert.equal(store.get(added.id).title, 'Sunset');
  assert.equal(listenerErrors.length, 1);
  assert.equal(listenerErrors[0].message, 'listener blew up');
});

test('a listener subscribing during a notification is not called for that mutation', () => {
  const { store } = setup();
  let lateCalls = 0;

  store.subscribe(() => {
    store.subscribe(() => lateCalls++);
  });

  store.add(input());

  assert.equal(lateCalls, 0);
});
