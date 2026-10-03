import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMemoryStore } from '../../src/js/data/memory-store.js';
import { ValidationError, StorageFullError } from '../../src/js/data/errors.js';
import { STORAGE_KEY } from '../../src/js/data/schema.js';
import { createFakeStorage, quotaExceededError, tickingNow } from '../helpers/fake-storage.js';

function record(overrides = {}) {
  return {
    id: 'm1',
    title: 'Karura forest walk',
    note: '',
    date: '2025-03-04',
    lat: -1.2359,
    lng: 36.8137,
    placeName: '',
    tags: ['trail'],
    photoIds: [],
    createdAt: '2025-03-04T09:00:00.000Z',
    updatedAt: '2025-03-04T09:00:00.000Z',
    ...overrides
  };
}

function setup(existing = []) {
  const storage = createFakeStorage(
    existing.length > 0 ? { [STORAGE_KEY]: JSON.stringify({ version: 1, memories: existing }) } : {}
  );
  const store = createMemoryStore({
    storage,
    now: tickingNow('2025-05-01T10:00:00.000Z'),
    makeId: () => 'generated'
  });
  return { storage, store };
}

function storedMemories(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  return raw === null ? null : JSON.parse(raw).memories;
}

test('an unknown id is added', () => {
  const { store } = setup();

  assert.deepEqual(store.merge([record()]), { added: 1, updated: 0, unchanged: 0 });
  assert.equal(store.list().length, 1);
  assert.equal(store.get('m1').title, 'Karura forest walk');
});

test('a newer record replaces the one here', () => {
  const { store } = setup([record({ title: 'Old title' })]);

  const result = store.merge([
    record({ title: 'New title', updatedAt: '2026-01-01T00:00:00.000Z' })
  ]);

  assert.deepEqual(result, { added: 0, updated: 1, unchanged: 0 });
  assert.equal(store.get('m1').title, 'New title');
});

test('an older record leaves the one here alone', () => {
  const { store } = setup([record({ title: 'Mine' })]);

  const result = store.merge([
    record({ title: 'Theirs', updatedAt: '2024-01-01T00:00:00.000Z' })
  ]);

  assert.deepEqual(result, { added: 0, updated: 0, unchanged: 1 });
  assert.equal(store.get('m1').title, 'Mine');
});

test('an equal updatedAt leaves the one here alone', () => {
  const { store } = setup([record({ title: 'Mine' })]);

  const result = store.merge([record({ title: 'Theirs' })]);

  assert.deepEqual(result, { added: 0, updated: 0, unchanged: 1 });
  assert.equal(store.get('m1').title, 'Mine');
});

test('createdAt and updatedAt come from the record, not the clock', () => {
  const { store } = setup();
  store.merge([record({ createdAt: '2019-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z' })]);

  const stored = store.get('m1');
  assert.equal(stored.createdAt, '2019-01-01T00:00:00.000Z');
  assert.equal(stored.updatedAt, '2020-01-01T00:00:00.000Z');
});

test('the id is kept, never regenerated', () => {
  const { store } = setup();
  store.merge([record({ id: 'from-the-file' })]);

  assert.equal(store.list()[0].id, 'from-the-file');
});

test('a mixed set reports each category', () => {
  const { store } = setup([
    record({ id: 'a', updatedAt: '2025-01-01T00:00:00.000Z' }),
    record({ id: 'b', updatedAt: '2025-01-01T00:00:00.000Z' })
  ]);

  const result = store.merge([
    record({ id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' }),
    record({ id: 'b', updatedAt: '2024-01-01T00:00:00.000Z' }),
    record({ id: 'c' })
  ]);

  assert.deepEqual(result, { added: 1, updated: 1, unchanged: 1 });
  assert.equal(store.list().length, 3);
});

test('merging nothing is a no-op', () => {
  const { store } = setup([record()]);

  assert.deepEqual(store.merge([]), { added: 0, updated: 0, unchanged: 0 });
  assert.equal(store.list().length, 1);
});

test('survives an argument that is not an array', () => {
  const { store } = setup();

  for (const value of [null, undefined, 'nope', 42, {}]) {
    assert.deepEqual(store.merge(value), { added: 0, updated: 0, unchanged: 0 });
  }
});

/* One bad record must not leave half a file merged. */
test('an invalid record throws without writing anything', () => {
  const { storage, store } = setup();

  assert.throws(
    () => store.merge([record({ id: 'good' }), record({ id: 'bad', title: '' })]),
    ValidationError
  );

  assert.deepEqual(store.list(), [], 'nothing was applied in memory');
  assert.equal(storedMemories(storage), null, 'nothing was written to storage');
});

test('an invalid record leaves what was already there untouched', () => {
  const { storage, store } = setup([record({ title: 'Existing' })]);

  assert.throws(() => store.merge([record({ id: 'bad', date: 'nope' })]), ValidationError);

  assert.equal(store.get('m1').title, 'Existing');
  assert.equal(storedMemories(storage).length, 1);
});

test('the thrown error names the offending fields', () => {
  const { store } = setup();

  try {
    store.merge([record({ title: '', date: 'nope' })]);
    assert.fail('should have thrown');
  } catch (error) {
    assert.ok(error instanceof ValidationError);
    assert.ok(error.errors.title, 'title error missing');
    assert.ok(error.errors.date, 'date error missing');
  }
});

// ------------------------------------------------------------- one write, one notice

test('a whole set is written once, not once per record', () => {
  const { storage, store } = setup();
  const writes = [];
  const original = storage.setItem.bind(storage);
  storage.setItem = (key, value) => {
    writes.push(key);
    original(key, value);
  };

  store.merge([record({ id: 'a' }), record({ id: 'b' }), record({ id: 'c' })]);

  assert.deepEqual(writes, [STORAGE_KEY], 'exactly one write');
});

test('subscribers are notified once for the whole set', () => {
  const { store } = setup();
  const notices = [];
  store.subscribe((snapshot) => notices.push(snapshot.length));

  store.merge([record({ id: 'a' }), record({ id: 'b' }), record({ id: 'c' })]);

  assert.deepEqual(notices, [3], 'one notification, already carrying every record');
});

/* A merge that changes nothing would otherwise force a full re-render for no reason. */
test('a merge that changes nothing writes nothing and notifies nobody', () => {
  const { storage, store } = setup([record()]);
  let notices = 0;
  store.subscribe(() => {
    notices += 1;
  });

  const before = storage.getItem(STORAGE_KEY);
  const result = store.merge([record({ title: 'Older', updatedAt: '2024-01-01T00:00:00.000Z' })]);

  assert.deepEqual(result, { added: 0, updated: 0, unchanged: 1 });
  assert.equal(notices, 0);
  assert.equal(storage.getItem(STORAGE_KEY), before, 'storage is byte for byte unchanged');
});

// ------------------------------------------------------------------- normalization

test('a record is normalized on the way in', () => {
  const { store } = setup();

  store.merge([
    record({
      title: '  Padded title  ',
      tags: ['  TRAIL ', 'trail', 'View'],
      lat: -1.23591234567,
      placeName: '  Karura  '
    })
  ]);

  const stored = store.get('m1');
  assert.equal(stored.title, 'Padded title');
  assert.deepEqual(stored.tags, ['trail', 'view']);
  assert.equal(stored.lat, -1.235912);
  assert.equal(stored.placeName, 'Karura');
});

test('photoIds survive the merge', () => {
  const { store } = setup();
  store.merge([record({ photoIds: ['p1', 'p2'] })]);

  assert.deepEqual(store.get('m1').photoIds, ['p1', 'p2']);
});

// ------------------------------------------------------------------------- quota

test('a full quota throws StorageFullError and changes nothing', () => {
  const { storage, store } = setup([record({ title: 'Existing' })]);
  storage.setItem = () => {
    throw quotaExceededError();
  };

  assert.throws(() => store.merge([record({ id: 'new' })]), StorageFullError);

  assert.equal(store.list().length, 1, 'in-memory state is untouched');
  assert.equal(store.get('m1').title, 'Existing');
});

test('a failed merge notifies nobody', () => {
  const { storage, store } = setup();
  let notices = 0;
  store.subscribe(() => {
    notices += 1;
  });
  storage.setItem = () => {
    throw quotaExceededError();
  };

  assert.throws(() => store.merge([record()]), StorageFullError);
  assert.equal(notices, 0);
});

// -------------------------------------------------------------------- duplicates

test('a repeated id inside one call keeps the first', () => {
  const { store } = setup();

  const result = store.merge([
    record({ title: 'First' }),
    record({ title: 'Second', updatedAt: '2026-01-01T00:00:00.000Z' })
  ]);

  assert.deepEqual(result, { added: 1, updated: 0, unchanged: 0 });
  assert.equal(store.get('m1').title, 'First');
  assert.equal(store.list().length, 1);
});

// ------------------------------------------------------------------------ copies

test('the merged record is a copy, not the object handed in', () => {
  const { store } = setup();
  const incoming = record({ tags: ['trail'] });

  store.merge([incoming]);
  incoming.tags.push('mutated');
  incoming.title = 'Mutated';

  assert.deepEqual(store.get('m1').tags, ['trail']);
  assert.equal(store.get('m1').title, 'Karura forest walk');
});

test('merged records sort into the list like any other', () => {
  const { store } = setup();

  store.merge([
    record({ id: 'later', date: '2025-06-01' }),
    record({ id: 'earlier', date: '2025-01-01' })
  ]);

  assert.deepEqual(
    store.list().map((memory) => memory.id),
    ['earlier', 'later']
  );
});
