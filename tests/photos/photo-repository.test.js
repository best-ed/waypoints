import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createPhotoRepository } from '../../src/js/photos/photo-repository.js';
import { createFakePhotoBackend, photoRecord } from '../helpers/fake-photo-backend.js';

function setup(initial = []) {
  const backend = createFakePhotoBackend(initial);
  return { backend, photos: createPhotoRepository({ backend }) };
}

test('stores a record and returns its id', async () => {
  const { backend, photos } = setup();

  const id = await photos.put(photoRecord('p1'));

  assert.equal(id, 'p1');
  assert.equal(backend.records.size, 1);
});

test('reads a stored record back whole', async () => {
  const { photos } = setup();
  const record = photoRecord('p1');
  await photos.put(record);

  const found = await photos.get('p1');

  assert.equal(found.id, 'p1');
  assert.equal(found.width, 1600);
  assert.equal(found.height, 1200);
  assert.equal(found.createdAt, '2025-05-01T10:00:00.000Z');
  assert.equal(found.blob.type, 'image/jpeg');
  assert.equal(found.thumb.size, 8000);
});

test('returns null for an id that is not stored', async () => {
  const { photos } = setup();
  assert.equal(await photos.get('missing'), null);
});

test('replaces a record stored under the same id', async () => {
  const { backend, photos } = setup();

  await photos.put(photoRecord('p1', { width: 800 }));
  await photos.put(photoRecord('p1', { width: 1600 }));

  assert.equal(backend.records.size, 1);
  assert.equal((await photos.get('p1')).width, 1600);
});

test('rejects a record missing any required field', async () => {
  const { photos } = setup();

  for (const field of ['id', 'blob', 'thumb', 'width', 'height', 'createdAt']) {
    const record = photoRecord('p1');
    delete record[field];

    await assert.rejects(() => photos.put(record), TypeError, 'missing ' + field + ' is rejected');
  }
});

test('rejects a record with a blank or non-string id', async () => {
  const { photos } = setup();

  for (const id of ['', '   ', 42]) {
    await assert.rejects(() => photos.put(photoRecord('p1', { id })), TypeError);
  }
});

test('rejects something that is not a record', async () => {
  const { photos } = setup();

  for (const value of [null, undefined, 'p1', 42]) {
    await assert.rejects(() => photos.put(value), TypeError);
  }
});

test('writes nothing when the record is rejected', async () => {
  const { backend, photos } = setup();

  await assert.rejects(() => photos.put({ id: 'p1' }), TypeError);

  assert.equal(backend.records.size, 0);
});

test('removes a record', async () => {
  const { backend, photos } = setup([photoRecord('p1'), photoRecord('p2')]);

  await photos.remove('p1');

  assert.equal(await photos.get('p1'), null);
  assert.equal(backend.records.size, 1);
});

test('removing an id that is not there is not an error', async () => {
  const { photos } = setup();
  await photos.remove('missing');
});

test('removes many ids and reports which went', async () => {
  const { backend, photos } = setup([photoRecord('p1'), photoRecord('p2'), photoRecord('p3')]);

  const removed = await photos.removeMany(['p1', 'p3']);

  assert.deepEqual(removed, ['p1', 'p3']);
  assert.deepEqual([...backend.records.keys()], ['p2']);
});

test('removeMany tolerates ids that are not stored', async () => {
  const { photos } = setup([photoRecord('p1')]);

  const removed = await photos.removeMany(['p1', 'missing']);

  assert.deepEqual(removed, ['p1', 'missing']);
  assert.equal(await photos.get('p1'), null);
});

/* Cleanup paths must not abandon the rest of the batch because one id failed. */
test('removeMany keeps going when the backend throws for one id', async () => {
  const backend = createFakePhotoBackend([photoRecord('p1'), photoRecord('p2')]);
  const photos = createPhotoRepository({ backend });

  const original = backend.remove;
  backend.remove = async (id) => {
    if (id === 'p1') {
      throw new Error('backend blew up');
    }
    return original(id);
  };

  const removed = await photos.removeMany(['p1', 'p2']);

  assert.deepEqual(removed, ['p2']);
  assert.equal(backend.records.has('p2'), false);
});

test('removeMany handles an empty list and non-arrays', async () => {
  const { photos } = setup([photoRecord('p1')]);

  assert.deepEqual(await photos.removeMany([]), []);
  assert.deepEqual(await photos.removeMany(null), []);
  assert.deepEqual(await photos.removeMany(undefined), []);

  assert.notEqual(await photos.get('p1'), null, 'an empty batch removes nothing');
});

test('lists the stored ids', async () => {
  const { photos } = setup([photoRecord('p1'), photoRecord('p2')]);

  assert.deepEqual(await photos.listIds(), ['p1', 'p2']);
});

test('lists nothing when the store is empty', async () => {
  const { photos } = setup();
  assert.deepEqual(await photos.listIds(), []);
});

test('returns an empty list when the backend gives back something odd', async () => {
  const backend = createFakePhotoBackend();
  backend.listIds = async () => undefined;

  assert.deepEqual(await createPhotoRepository({ backend }).listIds(), []);
});

test('lets a backend failure through on put', async () => {
  const { backend, photos } = setup();
  const boom = new Error('backend is down');
  backend.failWith(boom);

  await assert.rejects(() => photos.put(photoRecord('p1')), (error) => {
    assert.equal(error, boom);
    return true;
  });
});

test('lets a backend failure through on get and listIds', async () => {
  const { backend, photos } = setup();
  backend.failWith(new Error('backend is down'));

  await assert.rejects(() => photos.get('p1'));
  await assert.rejects(() => photos.listIds());
});
