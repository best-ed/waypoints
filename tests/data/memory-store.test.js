import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMemoryStore } from '../../src/js/data/memory-store.js';
import { ValidationError, StorageFullError } from '../../src/js/data/errors.js';
import { STORAGE_KEY } from '../../src/js/data/schema.js';
import { createFakeStorage, quotaExceededError, tickingNow } from '../helpers/fake-storage.js';

function createIdSequence(prefix = 'id-') {
  let count = 0;
  return () => prefix + ++count;
}

function setup({ initial = {} } = {}) {
  const storage = createFakeStorage(initial);
  const store = createMemoryStore({
    storage,
    now: tickingNow('2025-05-01T10:00:00.000Z'),
    makeId: createIdSequence()
  });
  return { storage, store };
}

function input(overrides = {}) {
  return {
    title: 'Sunset at the pier',
    date: '2025-03-04',
    lat: -1.2921,
    lng: 36.8219,
    ...overrides
  };
}

function storedMemories(storage) {
  return JSON.parse(storage.getItem(STORAGE_KEY)).memories;
}

test('starts empty when storage has nothing', () => {
  const { store } = setup();
  assert.deepEqual(store.list(), []);
});

test('adds a memory and returns the stored record', () => {
  const { store } = setup();

  const memory = store.add(input());

  assert.equal(memory.id, 'id-1');
  assert.equal(memory.title, 'Sunset at the pier');
  assert.equal(memory.createdAt, '2025-05-01T10:00:00.000Z');
  assert.equal(memory.updatedAt, memory.createdAt);
  assert.deepEqual(memory.tags, []);
  assert.deepEqual(memory.photoIds, []);
});

test('persists added memories to storage', () => {
  const { storage, store } = setup();

  store.add(input());

  assert.equal(storedMemories(storage).length, 1);
  assert.equal(storedMemories(storage)[0].title, 'Sunset at the pier');
});

test('normalizes input on the way in', () => {
  const { store } = setup();

  const memory = store.add(input({ title: '  Hike  ', tags: [' Trail ', 'TRAIL'], lat: '-1.29210049' }));

  assert.equal(memory.title, 'Hike');
  assert.deepEqual(memory.tags, ['trail']);
  assert.equal(memory.lat, -1.2921);
});

test('throws ValidationError with field errors for bad input', () => {
  const { store } = setup();

  assert.throws(
    () => store.add(input({ title: '', date: '2025-02-30' })),
    (error) => {
      assert.ok(error instanceof ValidationError);
      assert.equal(error.errors.title, 'Title is required');
      assert.equal(error.errors.date, 'Date must be a real calendar date');
      return true;
    }
  );
});

test('stores nothing when validation fails', () => {
  const { storage, store } = setup();

  assert.throws(() => store.add(input({ title: '' })), ValidationError);

  assert.deepEqual(store.list(), []);
  assert.equal(storage.getItem(STORAGE_KEY), null);
});

test('gets a memory by id and returns null for unknown ids', () => {
  const { store } = setup();
  const added = store.add(input());

  assert.equal(store.get(added.id).title, 'Sunset at the pier');
  assert.equal(store.get('nope'), null);
});

test('lists memories sorted by date ascending', () => {
  const { store } = setup();
  store.add(input({ title: 'Third', date: '2025-07-01' }));
  store.add(input({ title: 'First', date: '2024-01-15' }));
  store.add(input({ title: 'Second', date: '2025-03-04' }));

  assert.deepEqual(store.list().map((memory) => memory.title), ['First', 'Second', 'Third']);
});

test('breaks date ties by creation order', () => {
  const { store } = setup();
  store.add(input({ title: 'Earlier', date: '2025-03-04' }));
  store.add(input({ title: 'Later', date: '2025-03-04' }));

  assert.deepEqual(store.list().map((memory) => memory.title), ['Earlier', 'Later']);
});

test('returns copies so callers cannot mutate the store', () => {
  const { store } = setup();
  const added = store.add(input({ tags: ['trail'] }));

  added.title = 'Changed';
  added.tags.push('injected');
  store.list()[0].title = 'Also changed';

  assert.equal(store.get(added.id).title, 'Sunset at the pier');
  assert.deepEqual(store.get(added.id).tags, ['trail']);
});

test('updates a memory and bumps updatedAt', () => {
  const { store } = setup();
  const added = store.add(input());

  const updated = store.update(added.id, { title: 'Sunrise instead' });

  assert.equal(updated.title, 'Sunrise instead');
  assert.equal(updated.id, added.id);
  assert.equal(updated.createdAt, added.createdAt);
  assert.notEqual(updated.updatedAt, added.updatedAt);
  assert.ok(updated.updatedAt > added.updatedAt);
});

test('leaves untouched fields alone on update', () => {
  const { store } = setup();
  const added = store.add(input({ note: 'Cold wind.', tags: ['trail'], placeName: 'Nairobi' }));

  const updated = store.update(added.id, { title: 'New title' });

  assert.equal(updated.note, 'Cold wind.');
  assert.deepEqual(updated.tags, ['trail']);
  assert.equal(updated.placeName, 'Nairobi');
  assert.equal(updated.date, added.date);
});

test('ignores undefined values in an update patch', () => {
  const { store } = setup();
  const added = store.add(input({ note: 'Keep me', tags: ['trail'] }));

  const updated = store.update(added.id, { note: undefined, tags: undefined, title: 'New' });

  assert.equal(updated.note, 'Keep me');
  assert.deepEqual(updated.tags, ['trail']);
  assert.equal(updated.title, 'New');
});

test('refuses to change id or createdAt through an update', () => {
  const { store } = setup();
  const added = store.add(input());

  const updated = store.update(added.id, { id: 'hacked', createdAt: '1999-01-01T00:00:00.000Z' });

  assert.equal(updated.id, added.id);
  assert.equal(updated.createdAt, added.createdAt);
});

test('rejects an invalid update without storing it', () => {
  const { store } = setup();
  const added = store.add(input());

  assert.throws(() => store.update(added.id, { lat: 500 }), ValidationError);

  assert.equal(store.get(added.id).lat, -1.2921);
});

test('throws when updating an unknown id', () => {
  const { store } = setup();
  assert.throws(() => store.update('nope', { title: 'x' }), /No memory with id nope/);
});

test('removes a memory and reports whether it existed', () => {
  const { storage, store } = setup();
  const added = store.add(input());

  assert.equal(store.remove(added.id), true);
  assert.deepEqual(store.list(), []);
  assert.deepEqual(storedMemories(storage), []);

  assert.equal(store.remove(added.id), false);
});

test('leaves other memories in place when removing one', () => {
  const { store } = setup();
  const first = store.add(input({ title: 'First', date: '2025-01-01' }));
  store.add(input({ title: 'Second', date: '2025-02-01' }));

  store.remove(first.id);

  assert.deepEqual(store.list().map((memory) => memory.title), ['Second']);
});

test('loads memories written by an earlier session', () => {
  const existing = {
    version: 1,
    memories: [
      {
        id: 'old-1',
        title: 'From last time',
        note: '',
        date: '2025-01-01',
        lat: 0,
        lng: 0,
        placeName: '',
        tags: [],
        photoIds: [],
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z'
      }
    ]
  };
  const { store } = setup({ initial: { [STORAGE_KEY]: JSON.stringify(existing) } });

  assert.equal(store.list().length, 1);
  assert.equal(store.get('old-1').title, 'From last time');
});

test('starts empty and backs up when stored data is corrupt', () => {
  const { storage, store } = setup({ initial: { [STORAGE_KEY]: 'not json at all' } });

  assert.deepEqual(store.list(), []);
  assert.ok(storage.keys().some((key) => key.startsWith('waypoints:v1:corrupt-')));
});

test('surfaces a full quota as StorageFullError and keeps state unchanged', () => {
  const { storage, store } = setup();
  const added = store.add(input());

  storage.failOnSet(quotaExceededError());

  assert.throws(() => store.add(input({ title: 'Second' })), StorageFullError);
  assert.equal(store.list().length, 1);
  assert.equal(store.get(added.id).title, 'Sunset at the pier');
});
