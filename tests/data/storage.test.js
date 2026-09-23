import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyEnvelope, readEnvelope, writeEnvelope } from '../../src/js/data/storage.js';
import { StorageFullError } from '../../src/js/data/errors.js';
import { CORRUPT_KEY_PREFIX, STORAGE_KEY, STORAGE_VERSION } from '../../src/js/data/schema.js';
import { createFakeStorage, fixedNow, quotaExceededError } from '../helpers/fake-storage.js';

const NOW = fixedNow('2025-05-01T10:00:00.000Z');
const EXPECTED_BACKUP_KEY = CORRUPT_KEY_PREFIX + '2025-05-01T10:00:00.000Z';

function sampleMemory() {
  return {
    id: 'a1',
    title: 'Sunset',
    note: '',
    date: '2025-03-04',
    lat: -1.2921,
    lng: 36.8219,
    placeName: '',
    tags: [],
    photoIds: [],
    createdAt: '2025-05-01T10:00:00.000Z',
    updatedAt: '2025-05-01T10:00:00.000Z'
  };
}

test('returns an empty envelope when nothing is stored', () => {
  const storage = createFakeStorage();
  const envelope = readEnvelope(storage, NOW);

  assert.deepEqual(envelope, { version: STORAGE_VERSION, memories: [] });
});

test('treats an empty string as nothing stored', () => {
  const storage = createFakeStorage({ [STORAGE_KEY]: '' });
  assert.deepEqual(readEnvelope(storage, NOW), createEmptyEnvelope());
  assert.equal(storage.keys().some((key) => key.startsWith(CORRUPT_KEY_PREFIX)), false);
});

test('reads back what was written', () => {
  const storage = createFakeStorage();
  writeEnvelope(storage, [sampleMemory()]);

  const envelope = readEnvelope(storage, NOW);
  assert.equal(envelope.version, STORAGE_VERSION);
  assert.equal(envelope.memories.length, 1);
  assert.equal(envelope.memories[0].title, 'Sunset');
});

test('writes the version field alongside the memories', () => {
  const storage = createFakeStorage();
  writeEnvelope(storage, []);

  const raw = JSON.parse(storage.getItem(STORAGE_KEY));
  assert.equal(raw.version, 1);
  assert.deepEqual(raw.memories, []);
});

test('backs up corrupt JSON and starts empty instead of throwing', () => {
  const storage = createFakeStorage({ [STORAGE_KEY]: '{"version":1,"memories":[' });

  const envelope = readEnvelope(storage, NOW);

  assert.deepEqual(envelope, createEmptyEnvelope());
  assert.equal(storage.getItem(EXPECTED_BACKUP_KEY), '{"version":1,"memories":[');
});

test('backs up JSON that parses but has the wrong shape', () => {
  for (const raw of ['null', '[]', '"a string"', '42', '{"memories":"not an array"}', '{}']) {
    const storage = createFakeStorage({ [STORAGE_KEY]: raw });

    const envelope = readEnvelope(storage, NOW);

    assert.deepEqual(envelope, createEmptyEnvelope(), `expected ${raw} to be treated as corrupt`);
    assert.equal(storage.getItem(EXPECTED_BACKUP_KEY), raw);
  }
});

test('leaves the original value in place when backing up', () => {
  const storage = createFakeStorage({ [STORAGE_KEY]: 'not json' });

  readEnvelope(storage, NOW);

  assert.equal(storage.getItem(STORAGE_KEY), 'not json');
});

test('does not back up a valid envelope', () => {
  const storage = createFakeStorage({ [STORAGE_KEY]: '{"version":1,"memories":[]}' });

  readEnvelope(storage, NOW);

  assert.deepEqual(storage.keys(), [STORAGE_KEY]);
});

test('keeps an unknown version rather than rewriting it', () => {
  const storage = createFakeStorage({ [STORAGE_KEY]: '{"version":99,"memories":[]}' });

  assert.equal(readEnvelope(storage, NOW).version, 99);
});

test('survives a backup that itself fails', () => {
  const storage = createFakeStorage({ [STORAGE_KEY]: 'not json' });
  storage.failOnSet(quotaExceededError());

  assert.deepEqual(readEnvelope(storage, NOW), createEmptyEnvelope());
});

test('rethrows a quota failure as StorageFullError', () => {
  const storage = createFakeStorage();
  const quota = quotaExceededError();
  storage.failOnSet(quota);

  assert.throws(
    () => writeEnvelope(storage, [sampleMemory()]),
    (error) => {
      assert.ok(error instanceof StorageFullError);
      assert.equal(error.name, 'StorageFullError');
      assert.equal(error.cause, quota);
      return true;
    }
  );
});

test('recognises the Firefox and legacy quota signals', () => {
  for (const signal of [
    { name: 'NS_ERROR_DOM_QUOTA_REACHED' },
    { name: 'SomethingElse', code: 22 },
    { name: 'SomethingElse', code: 1014 }
  ]) {
    const storage = createFakeStorage();
    const error = Object.assign(new Error('full'), signal);
    storage.failOnSet(error);

    assert.throws(() => writeEnvelope(storage, []), StorageFullError);
  }
});

test('passes through failures that are not about quota', () => {
  const storage = createFakeStorage();
  const boom = Object.assign(new Error('security error'), { name: 'SecurityError' });
  storage.failOnSet(boom);

  assert.throws(() => writeEnvelope(storage, []), (error) => {
    assert.equal(error, boom);
    assert.ok(!(error instanceof StorageFullError));
    return true;
  });
});
