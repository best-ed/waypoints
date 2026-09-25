import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMemoryStore } from '../../src/js/data/memory-store.js';
import { ValidationError, StorageFullError } from '../../src/js/data/errors.js';
import { STORAGE_KEY } from '../../src/js/data/schema.js';
import { createFakeStorage, quotaExceededError, tickingNow } from '../helpers/fake-storage.js';

function setup() {
  const storage = createFakeStorage();
  let count = 0;
  const store = createMemoryStore({
    storage,
    now: tickingNow('2025-05-01T10:00:00.000Z'),
    makeId: () => 'id-' + ++count
  });
  return { storage, store };
}

function input(overrides = {}) {
  return { title: 'Sunset', date: '2025-03-04', lat: -1.2921, lng: 36.8219, ...overrides };
}

function storedMemories(storage) {
  return JSON.parse(storage.getItem(STORAGE_KEY)).memories;
}

test('brings a removed memory back with its original id and timestamps', () => {
  const { store } = setup();
  const added = store.add(input({ note: 'Cold wind.', tags: ['trail'] }));
  store.remove(added.id);

  const restored = store.restore(added);

  assert.equal(restored.id, added.id);
  assert.equal(restored.createdAt, added.createdAt);
  assert.equal(restored.updatedAt, added.updatedAt);
  assert.equal(restored.title, added.title);
  assert.equal(restored.note, 'Cold wind.');
  assert.deepEqual(restored.tags, ['trail']);
});

test('does not bump updatedAt on restore', () => {
  const { store } = setup();
  const added = store.add(input());
  const updated = store.update(added.id, { title: 'Changed' });
  store.remove(added.id);

  const restored = store.restore(updated);

  assert.equal(restored.updatedAt, updated.updatedAt);
  assert.notEqual(restored.updatedAt, added.updatedAt);
});

test('puts the memory back in the list and in storage', () => {
  const { storage, store } = setup();
  const added = store.add(input());
  store.remove(added.id);
  assert.deepEqual(store.list(), []);

  store.restore(added);

  assert.equal(store.list().length, 1);
  assert.equal(store.get(added.id).title, 'Sunset');
  assert.equal(storedMemories(storage).length, 1);
});

test('restores into the right sort position', () => {
  const { store } = setup();
  store.add(input({ title: 'First', date: '2025-01-01' }));
  const middle = store.add(input({ title: 'Middle', date: '2025-02-01' }));
  store.add(input({ title: 'Last', date: '2025-03-01' }));

  store.remove(middle.id);
  store.restore(middle);

  assert.deepEqual(store.list().map((memory) => memory.title), ['First', 'Middle', 'Last']);
});

test('rejects a duplicate id', () => {
  const { store } = setup();
  const added = store.add(input());

  assert.throws(() => store.restore(added), /already exists/);
  assert.equal(store.list().length, 1);
});

test('validates the memory fields', () => {
  const { store } = setup();
  const added = store.add(input());
  store.remove(added.id);

  assert.throws(
    () => store.restore({ ...added, title: '', date: '2025-02-30' }),
    (error) => {
      assert.ok(error instanceof ValidationError);
      assert.equal(error.errors.title, 'Title is required');
      assert.equal(error.errors.date, 'Date must be a real calendar date');
      return true;
    }
  );

  assert.deepEqual(store.list(), []);
});

test('requires an id', () => {
  const { store } = setup();
  const added = store.add(input());
  store.remove(added.id);

  for (const id of ['', '   ', null, undefined, 42]) {
    assert.throws(
      () => store.restore({ ...added, id }),
      (error) => {
        assert.ok(error instanceof ValidationError);
        assert.equal(error.errors.id, 'Id is required');
        return true;
      }
    );
  }
});

test('requires real ISO timestamps', () => {
  const { store } = setup();
  const added = store.add(input());
  store.remove(added.id);

  for (const value of ['', 'yesterday', '2025-05-01', '2025-05-01 10:00:00', null, undefined, 42]) {
    assert.throws(
      () => store.restore({ ...added, createdAt: value }),
      (error) => {
        assert.ok(error instanceof ValidationError);
        assert.match(error.errors.createdAt, /ISO timestamp/);
        return true;
      }
    );

    assert.throws(() => store.restore({ ...added, updatedAt: value }), ValidationError);
  }
});

test('accepts a timestamp without milliseconds', () => {
  const { store } = setup();
  const added = store.add(input());
  store.remove(added.id);

  const restored = store.restore({ ...added, createdAt: '2025-05-01T10:00:00Z' });

  assert.equal(restored.createdAt, '2025-05-01T10:00:00Z');
});

test('notifies subscribers', () => {
  const { store } = setup();
  const added = store.add(input());
  store.remove(added.id);

  const seen = [];
  store.subscribe((memories) => seen.push(memories.length));

  store.restore(added);

  assert.deepEqual(seen, [1]);
});

test('does not notify when the restore is rejected', () => {
  const { store } = setup();
  const added = store.add(input());

  let count = 0;
  store.subscribe(() => count++);

  assert.throws(() => store.restore(added), /already exists/);
  assert.throws(() => store.restore({ ...added, id: 'other', title: '' }), ValidationError);

  assert.equal(count, 0);
});

test('surfaces a full quota and leaves the memory out', () => {
  const { storage, store } = setup();
  const added = store.add(input());
  store.remove(added.id);

  storage.failOnSet(quotaExceededError());

  assert.throws(() => store.restore(added), StorageFullError);
  assert.deepEqual(store.list(), []);
});

test('returns a copy the caller cannot use to mutate the store', () => {
  const { store } = setup();
  const added = store.add(input({ tags: ['trail'] }));
  store.remove(added.id);

  const restored = store.restore(added);
  restored.title = 'Changed';
  restored.tags.push('injected');

  assert.equal(store.get(added.id).title, 'Sunset');
  assert.deepEqual(store.get(added.id).tags, ['trail']);
});

test('survives a remove and restore round trip repeated', () => {
  const { store } = setup();
  const added = store.add(input());

  for (let round = 0; round < 3; round++) {
    store.remove(added.id);
    store.restore(added);
  }

  assert.equal(store.list().length, 1);
  assert.equal(store.get(added.id).id, added.id);
  assert.equal(store.get(added.id).createdAt, added.createdAt);
});
