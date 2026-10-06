import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deserializePhotoRecord,
  serializePhotoRecord
} from '../../src/js/photos/photo-serialize.js';

const bytes = (...values) => new Uint8Array(values);

function record(overrides = {}) {
  return {
    id: 'photo-1',
    blob: new Blob([bytes(1, 2, 3, 4)], { type: 'image/jpeg' }),
    thumb: new Blob([bytes(9, 8)], { type: 'image/jpeg' }),
    width: 1600,
    height: 1200,
    createdAt: '2026-03-04T10:00:00.000Z',
    ...overrides
  };
}

async function readBytes(blob) {
  return [...new Uint8Array(await blob.arrayBuffer())];
}

test('serialize turns both blobs into ArrayBuffers and keeps their types', async () => {
  const stored = await serializePhotoRecord(record());

  assert.ok(stored.bytes instanceof ArrayBuffer);
  assert.ok(stored.thumbBytes instanceof ArrayBuffer);
  assert.equal(stored.type, 'image/jpeg');
  assert.equal(stored.thumbType, 'image/jpeg');
  assert.deepEqual([...new Uint8Array(stored.bytes)], [1, 2, 3, 4]);
  assert.deepEqual([...new Uint8Array(stored.thumbBytes)], [9, 8]);
});

test('serialize stores no Blob anywhere in the record', async () => {
  const stored = await serializePhotoRecord(record());

  for (const [field, value] of Object.entries(stored)) {
    assert.ok(!(value instanceof Blob), field + ' is still a Blob');
  }
});

test('serialize carries the metadata through untouched', async () => {
  const stored = await serializePhotoRecord(record());

  assert.equal(stored.id, 'photo-1');
  assert.equal(stored.width, 1600);
  assert.equal(stored.height, 1200);
  assert.equal(stored.createdAt, '2026-03-04T10:00:00.000Z');
});

test('a record round trips back to equivalent blobs', async () => {
  const original = record();
  const restored = deserializePhotoRecord(await serializePhotoRecord(original));

  assert.ok(restored.blob instanceof Blob);
  assert.ok(restored.thumb instanceof Blob);
  assert.deepEqual(await readBytes(restored.blob), await readBytes(original.blob));
  assert.deepEqual(await readBytes(restored.thumb), await readBytes(original.thumb));
  assert.equal(restored.blob.type, 'image/jpeg');
  assert.equal(restored.thumb.type, 'image/jpeg');
});

test('a round trip preserves the exact byte length of a larger image', async () => {
  const payload = new Uint8Array(70000);
  for (let index = 0; index < payload.length; index++) {
    payload[index] = index % 256;
  }

  const restored = deserializePhotoRecord(
    await serializePhotoRecord(record({ blob: new Blob([payload], { type: 'image/jpeg' }) }))
  );

  assert.equal(restored.blob.size, 70000);
  assert.deepEqual(await readBytes(restored.blob), [...payload]);
});

test('a blob with no type falls back to the output type rather than an empty one', async () => {
  const stored = await serializePhotoRecord(record({ blob: new Blob([bytes(1)]) }));

  assert.equal(stored.type, 'image/jpeg');
  assert.equal(deserializePhotoRecord(stored).blob.type, 'image/jpeg');
});

test('a png keeps its own type through the round trip', async () => {
  const stored = await serializePhotoRecord(
    record({ blob: new Blob([bytes(1)], { type: 'image/png' }) })
  );

  assert.equal(stored.type, 'image/png');
  assert.equal(deserializePhotoRecord(stored).blob.type, 'image/png');
});

test('serialize refuses a record with no image data', async () => {
  await assert.rejects(() => serializePhotoRecord(record({ blob: null })), TypeError);
});

test('serialize refuses something that is not a record', async () => {
  await assert.rejects(() => serializePhotoRecord(null), TypeError);
  await assert.rejects(() => serializePhotoRecord('photo'), TypeError);
});

test('a missing thumbnail serializes to null rather than throwing', async () => {
  const stored = await serializePhotoRecord(record({ thumb: null }));

  assert.equal(stored.thumbBytes, null);
  assert.equal(stored.thumbType, '');
  assert.ok(stored.bytes instanceof ArrayBuffer);
});

test('a missing thumbnail deserializes to null, leaving the full image usable', async () => {
  const restored = deserializePhotoRecord(await serializePhotoRecord(record({ thumb: null })));

  assert.equal(restored.thumb, null);
  assert.ok(restored.blob instanceof Blob);
  assert.equal(restored.blob.size, 4);
});

test('a stored record whose thumbBytes field is absent entirely reads back as null', () => {
  const restored = deserializePhotoRecord({
    id: 'photo-1',
    bytes: new Uint8Array(bytes(1, 2)).buffer,
    type: 'image/jpeg',
    width: 10,
    height: 10,
    createdAt: '2026-03-04T10:00:00.000Z'
  });

  assert.equal(restored.thumb, null);
  assert.equal(restored.blob.size, 2);
});

test('a legacy record holding Blobs is read back as it is', async () => {
  const legacy = {
    id: 'legacy-1',
    blob: new Blob([bytes(5, 6, 7)], { type: 'image/jpeg' }),
    thumb: new Blob([bytes(4)], { type: 'image/jpeg' }),
    width: 800,
    height: 600,
    createdAt: '2025-01-01T00:00:00.000Z'
  };

  const restored = deserializePhotoRecord(legacy);

  assert.equal(restored.blob, legacy.blob);
  assert.equal(restored.thumb, legacy.thumb);
  assert.equal(restored.id, 'legacy-1');
  assert.equal(restored.width, 800);
  assert.equal(restored.height, 600);
  assert.equal(restored.createdAt, '2025-01-01T00:00:00.000Z');
  assert.deepEqual(await readBytes(restored.blob), [5, 6, 7]);
});

test('a legacy record with no thumbnail reads back with a null one', () => {
  const restored = deserializePhotoRecord({
    id: 'legacy-2',
    blob: new Blob([bytes(1)], { type: 'image/jpeg' }),
    width: 10,
    height: 10,
    createdAt: '2025-01-01T00:00:00.000Z'
  });

  assert.equal(restored.thumb, null);
  assert.ok(restored.blob instanceof Blob);
});

test('deserialize returns the new shape even when a record carries both', async () => {
  /* Nothing writes both, but a half-migrated record must not be ambiguous: bytes win. */
  const stored = await serializePhotoRecord(record());
  const restored = deserializePhotoRecord({
    ...stored,
    blob: new Blob([bytes(99)], { type: 'image/png' })
  });

  assert.equal(restored.blob.type, 'image/jpeg');
  assert.deepEqual(await readBytes(restored.blob), [1, 2, 3, 4]);
});

test('deserialize returns null for a record with neither bytes nor a blob', () => {
  assert.equal(deserializePhotoRecord({ id: 'x', width: 1, height: 1 }), null);
});

test('deserialize returns null for a missing record', () => {
  assert.equal(deserializePhotoRecord(undefined), null);
  assert.equal(deserializePhotoRecord(null), null);
  assert.equal(deserializePhotoRecord('photo'), null);
});

test('deserialize accepts a typed array view, which some engines hand back', async () => {
  const restored = deserializePhotoRecord({
    id: 'view-1',
    bytes: bytes(1, 2, 3),
    type: 'image/jpeg',
    thumbBytes: bytes(4),
    thumbType: 'image/jpeg',
    width: 10,
    height: 10,
    createdAt: '2026-01-01T00:00:00.000Z'
  });

  assert.deepEqual(await readBytes(restored.blob), [1, 2, 3]);
  assert.deepEqual(await readBytes(restored.thumb), [4]);
});
