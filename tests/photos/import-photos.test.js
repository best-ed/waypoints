import { test } from 'node:test';
import assert from 'node:assert/strict';

import { writeImportedPhotos } from '../../src/js/photos/import-photos.js';
import { bytesToBase64 } from '../../src/js/io/base64.js';
import { FULL_MAX_EDGE, THUMB_MAX_EDGE } from '../../src/js/photos/photo-rules.js';

const NOW = () => new Date('2026-10-03T07:00:00.000Z');

function photo(overrides = {}) {
  return {
    id: 'p1',
    mime: 'image/jpeg',
    width: 1600,
    height: 1200,
    createdAt: '2025-03-04T09:00:00.000Z',
    data: bytesToBase64(new Uint8Array([1, 2, 3, 4])),
    thumb: bytesToBase64(new Uint8Array([5, 6, 7])),
    ...overrides
  };
}

function fakeRepository({ failOn = null } = {}) {
  const stored = new Map();
  return {
    stored,
    removed: [],
    async put(record) {
      if (failOn === record.id) {
        throw new Error('write failed for ' + record.id);
      }
      stored.set(record.id, record);
    },
    async removeMany(ids) {
      this.removed.push(...ids);
      for (const id of ids) {
        stored.delete(id);
      }
    }
  };
}

/* Stands in for createImageBitmap. The size it reports is driven by the blob's byte length so
   a test can ask for an oversized image without encoding a real one. */
function fakeDecode({ sizes = {}, rejectSizes = [] } = {}) {
  return async (blob) => {
    if (rejectSizes.includes(blob.size)) {
      throw new Error('not an image');
    }
    const named = sizes[blob.size];
    return named ?? { width: 800, height: 600 };
  };
}

function fakeReprocess(calls) {
  return async (blob, { makeId, now }) => {
    calls.push({ size: blob.size, id: makeId() });
    return {
      id: makeId(),
      blob,
      thumb: new Blob([new Uint8Array([1])], { type: 'image/jpeg' }),
      width: FULL_MAX_EDGE,
      height: 900,
      createdAt: now().toISOString(),
      reprocessed: true
    };
  };
}

test('writes a usable photo', async () => {
  const repository = fakeRepository();
  const result = await writeImportedPhotos([photo()], {
    repository,
    decode: fakeDecode(),
    reprocess: fakeReprocess([]),
    now: NOW
  });

  assert.deepEqual(result.written, ['p1']);
  assert.deepEqual(result.skipped, []);
  assert.equal(repository.stored.size, 1);
});

test('the stored record keeps the id from the file', async () => {
  const repository = fakeRepository();
  await writeImportedPhotos([photo({ id: 'from-file' })], {
    repository,
    decode: fakeDecode(),
    reprocess: fakeReprocess([]),
    now: NOW
  });

  assert.ok(repository.stored.has('from-file'));
});

test('the stored record carries real blobs, not base64', async () => {
  const repository = fakeRepository();
  await writeImportedPhotos([photo()], {
    repository,
    decode: fakeDecode(),
    reprocess: fakeReprocess([]),
    now: NOW
  });

  const record = repository.stored.get('p1');
  assert.ok(record.blob instanceof Blob);
  assert.equal(record.blob.size, 4);
  assert.equal(record.blob.type, 'image/jpeg');
  assert.ok(record.thumb instanceof Blob);
});

test('writes several photos and reports progress for each', async () => {
  const repository = fakeRepository();
  const progress = [];

  const result = await writeImportedPhotos(
    [photo({ id: 'a' }), photo({ id: 'b' }), photo({ id: 'c' })],
    {
      repository,
      decode: fakeDecode(),
      reprocess: fakeReprocess([]),
      onProgress: (done, total) => progress.push(done + ' of ' + total),
      now: NOW
    }
  );

  assert.deepEqual(result.written, ['a', 'b', 'c']);
  assert.deepEqual(progress, ['1 of 3', '2 of 3', '3 of 3']);
});

test('an empty queue writes nothing', async () => {
  const repository = fakeRepository();
  const result = await writeImportedPhotos([], {
    repository,
    decode: fakeDecode(),
    reprocess: fakeReprocess([])
  });

  assert.deepEqual(result.written, []);
  assert.equal(repository.stored.size, 0);
});

test('survives an argument that is not an array', async () => {
  const repository = fakeRepository();

  for (const value of [null, undefined, 'nope', 42]) {
    const result = await writeImportedPhotos(value, {
      repository,
      decode: fakeDecode(),
      reprocess: fakeReprocess([])
    });
    assert.deepEqual(result.written, []);
  }
});

/* A JSON file can claim image/jpeg over any bytes at all; only a decode settles it. */
test('bytes that are not an image are skipped, not written', async () => {
  const repository = fakeRepository();
  const junk = bytesToBase64(new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9, 9, 9]));

  const result = await writeImportedPhotos([photo({ data: junk, thumb: '' })], {
    repository,
    decode: fakeDecode({ rejectSizes: [10] }),
    reprocess: fakeReprocess([]),
    now: NOW
  });

  assert.deepEqual(result.written, []);
  assert.equal(result.skipped.length, 1);
  assert.match(result.skipped[0].reason, /could not be decoded/);
  assert.equal(repository.stored.size, 0);
});

test('one undecodable photo does not stop the rest', async () => {
  const repository = fakeRepository();
  const junk = bytesToBase64(new Uint8Array(new Array(10).fill(9)));

  const result = await writeImportedPhotos(
    [photo({ id: 'good1' }), photo({ id: 'bad', data: junk, thumb: '' }), photo({ id: 'good2' })],
    {
      repository,
      decode: fakeDecode({ rejectSizes: [10] }),
      reprocess: fakeReprocess([]),
      now: NOW
    }
  );

  assert.deepEqual(result.written, ['good1', 'good2']);
  assert.equal(result.skipped.length, 1);
});

test('data that is not base64 at all is skipped', async () => {
  const repository = fakeRepository();
  const result = await writeImportedPhotos([photo({ data: 'not base64!' })], {
    repository,
    decode: fakeDecode(),
    reprocess: fakeReprocess([]),
    now: NOW
  });

  assert.deepEqual(result.written, []);
  assert.match(result.skipped[0].reason, /could not be decoded/);
});

// ------------------------------------------------------------------ re-processing

test('an image over the full-size limit goes back through the pipeline', async () => {
  const repository = fakeRepository();
  const calls = [];
  const big = bytesToBase64(new Uint8Array(100));

  await writeImportedPhotos([photo({ data: big })], {
    repository,
    decode: fakeDecode({ sizes: { 100: { width: 4000, height: 3000 }, 3: { width: 320, height: 240 } } }),
    reprocess: fakeReprocess(calls),
    now: NOW
  });

  assert.equal(calls.length, 1, 'the pipeline was asked to redo it');
  assert.equal(calls[0].id, 'p1', 'and it keeps the id the memories refer to');
  assert.equal(repository.stored.get('p1').reprocessed, true);
});

test('a thumbnail over the thumb limit forces re-processing', async () => {
  const repository = fakeRepository();
  const calls = [];

  await writeImportedPhotos([photo()], {
    repository,
    decode: fakeDecode({
      sizes: { 4: { width: 800, height: 600 }, 3: { width: THUMB_MAX_EDGE + 10, height: 100 } }
    }),
    reprocess: fakeReprocess(calls),
    now: NOW
  });

  assert.equal(calls.length, 1);
});

test('a photo within both limits is stored as it came', async () => {
  const repository = fakeRepository();
  const calls = [];

  await writeImportedPhotos([photo()], {
    repository,
    decode: fakeDecode({
      sizes: { 4: { width: FULL_MAX_EDGE, height: 900 }, 3: { width: THUMB_MAX_EDGE, height: 200 } }
    }),
    reprocess: fakeReprocess(calls),
    now: NOW
  });

  assert.equal(calls.length, 0, 'nothing to redo');
  assert.equal(repository.stored.get('p1').reprocessed, undefined);
  assert.equal(repository.stored.get('p1').width, FULL_MAX_EDGE);
});

test('a missing thumbnail is regenerated rather than stored empty', async () => {
  const repository = fakeRepository();
  const calls = [];

  await writeImportedPhotos([photo({ thumb: '' })], {
    repository,
    decode: fakeDecode({ sizes: { 4: { width: 800, height: 600 } } }),
    reprocess: fakeReprocess(calls),
    now: NOW
  });

  assert.equal(calls.length, 1);
  assert.ok(repository.stored.get('p1').thumb instanceof Blob);
});

test('a broken thumbnail costs the thumbnail, not the photo', async () => {
  const repository = fakeRepository();
  const calls = [];

  await writeImportedPhotos([photo({ thumb: bytesToBase64(new Uint8Array(7)) })], {
    repository,
    decode: fakeDecode({ sizes: { 4: { width: 800, height: 600 } }, rejectSizes: [7] }),
    reprocess: fakeReprocess(calls),
    now: NOW
  });

  assert.equal(calls.length, 1, 'regenerated through the pipeline');
  assert.ok(repository.stored.has('p1'), 'the photo itself survived');
});

test('createdAt falls back to now when the file has none', async () => {
  const repository = fakeRepository();
  await writeImportedPhotos([photo({ createdAt: '' })], {
    repository,
    decode: fakeDecode({
      sizes: { 4: { width: FULL_MAX_EDGE, height: 900 }, 3: { width: THUMB_MAX_EDGE, height: 200 } }
    }),
    reprocess: fakeReprocess([]),
    now: NOW
  });

  assert.equal(repository.stored.get('p1').createdAt, '2026-10-03T07:00:00.000Z');
});

// ---------------------------------------------------------------------- rollback

/* The guarantee that matters: a failure part way through must leave the store exactly as it
   was, not half full of blobs nothing refers to. */
test('a failed write removes everything this call had written', async () => {
  const repository = fakeRepository({ failOn: 'c' });

  await assert.rejects(
    () =>
      writeImportedPhotos([photo({ id: 'a' }), photo({ id: 'b' }), photo({ id: 'c' })], {
        repository,
        decode: fakeDecode(),
        reprocess: fakeReprocess([]),
        now: NOW
      }),
    /write failed for c/
  );

  assert.deepEqual(repository.removed, ['a', 'b']);
  assert.equal(repository.stored.size, 0, 'nothing of this import is left behind');
});

test('rollback touches only what this call wrote', async () => {
  const repository = fakeRepository({ failOn: 'new2' });
  repository.stored.set('pre-existing', { id: 'pre-existing' });

  await assert.rejects(() =>
    writeImportedPhotos([photo({ id: 'new1' }), photo({ id: 'new2' })], {
      repository,
      decode: fakeDecode(),
      reprocess: fakeReprocess([]),
      now: NOW
    })
  );

  assert.deepEqual(repository.removed, ['new1']);
  assert.ok(repository.stored.has('pre-existing'), 'an unrelated photo was left alone');
});

test('a failure on the very first photo rolls back nothing and still throws', async () => {
  const repository = fakeRepository({ failOn: 'a' });

  await assert.rejects(() =>
    writeImportedPhotos([photo({ id: 'a' })], {
      repository,
      decode: fakeDecode(),
      reprocess: fakeReprocess([]),
      now: NOW
    })
  );

  assert.deepEqual(repository.removed, []);
});

/* The original failure is what the caller needs to hear about. */
test('a rollback that itself fails does not mask the real error', async () => {
  const repository = fakeRepository({ failOn: 'b' });
  repository.removeMany = async () => {
    throw new Error('rollback also failed');
  };

  await assert.rejects(
    () =>
      writeImportedPhotos([photo({ id: 'a' }), photo({ id: 'b' })], {
        repository,
        decode: fakeDecode(),
        reprocess: fakeReprocess([]),
        now: NOW
      }),
    /write failed for b/
  );
});

test('a failure inside re-processing rolls back too', async () => {
  const repository = fakeRepository();
  const failing = async () => {
    throw new Error('reprocess exploded');
  };

  await assert.rejects(
    () =>
      writeImportedPhotos([photo({ id: 'a' }), photo({ id: 'b', thumb: '' })], {
        repository,
        /* 'a' is within both limits so it is stored as it came; 'b' has no thumbnail, so it
           needs the pipeline, which is where the failure lands. */
        decode: fakeDecode({
          sizes: { 4: { width: FULL_MAX_EDGE, height: 900 }, 3: { width: THUMB_MAX_EDGE, height: 200 } }
        }),
        reprocess: failing,
        now: NOW
      }),
    /reprocess exploded/
  );

  assert.deepEqual(repository.removed, ['a']);
});
