import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  readEnvelope,
  planImport,
  readImport,
  checkFileSize,
  ImportError,
  MAX_IMPORT_BYTES,
  MAX_PHOTO_BYTES
} from '../../src/js/io/parse-import.js';
import { bytesToBase64 } from '../../src/js/io/base64.js';

function memory(overrides = {}) {
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

function photo(overrides = {}) {
  return {
    id: 'p1',
    mime: 'image/jpeg',
    width: 1600,
    height: 1200,
    createdAt: '2025-03-04T09:00:00.000Z',
    data: bytesToBase64(new Uint8Array([1, 2, 3, 4])),
    thumb: bytesToBase64(new Uint8Array([5, 6])),
    ...overrides
  };
}

function envelope(overrides = {}) {
  return {
    format: 'waypoints-export',
    version: 1,
    exportedAt: '2026-10-03T07:00:00.000Z',
    memories: [],
    photos: [],
    ...overrides
  };
}

const text = (value) => JSON.stringify(value);

function rejects(input, kind) {
  assert.throws(
    () => readEnvelope(typeof input === 'string' ? input : text(input)),
    (error) => {
      assert.ok(error instanceof ImportError, 'expected an ImportError, got ' + error);
      assert.equal(error.kind, kind, 'kind was ' + error.kind + ': ' + error.message);
      assert.ok(error.message.length > 10, 'the message must say something useful');
      return true;
    }
  );
}

// ---------------------------------------------------------------- the envelope

test('reads a well-formed envelope', () => {
  const result = readEnvelope(text(envelope({ memories: [memory()] })));

  assert.equal(result.format, 'waypoints-export');
  assert.equal(result.version, 1);
  assert.equal(result.memories.length, 1);
  assert.deepEqual(result.photos, []);
});

test('rejects a file that is not JSON', () => {
  rejects('this is not json', 'notJson');
  rejects('', 'notJson');
  rejects('{ broken', 'notJson');
  rejects('<html></html>', 'notJson');
});

test('rejects JSON that is not an object', () => {
  rejects('[]', 'notAnEnvelope');
  rejects('null', 'notAnEnvelope');
  rejects('42', 'notAnEnvelope');
  rejects('"a string"', 'notAnEnvelope');
});

test('rejects a file that is not a waypoints export', () => {
  rejects(envelope({ format: 'something-else' }), 'wrongFormat');
  rejects(envelope({ format: undefined }), 'wrongFormat');
  rejects({ memories: [] }, 'wrongFormat');
});

/* A newer version gets its own message, because the answer is to update rather than to go
   hunting for what is wrong with the file. */
test('a newer version says so plainly', () => {
  assert.throws(
    () => readEnvelope(text(envelope({ version: 2 }))),
    (error) => {
      assert.equal(error.kind, 'newerVersion');
      assert.match(error.message, /newer version/i);
      return true;
    }
  );

  rejects(envelope({ version: 99 }), 'newerVersion');
});

test('rejects a version that is not a whole number', () => {
  for (const version of ['1', 1.5, null, undefined, {}]) {
    rejects(envelope({ version }), 'unsupportedVersion');
  }
});

test('rejects a version below the supported range', () => {
  rejects(envelope({ version: 0 }), 'unsupportedVersion');
  rejects(envelope({ version: -1 }), 'unsupportedVersion');
});

test('rejects an envelope with no memories list', () => {
  rejects(envelope({ memories: undefined }), 'badMemories');
  rejects(envelope({ memories: 'nope' }), 'badMemories');
  rejects(envelope({ memories: {} }), 'badMemories');
});

test('a missing photos array reads as an export without photos', () => {
  const result = readEnvelope(text(envelope({ photos: undefined })));

  assert.deepEqual(result.photos, []);
});

test('rejects a file over the size limit before reading it', () => {
  assert.throws(() => checkFileSize(MAX_IMPORT_BYTES + 1), (error) => error.kind === 'tooLarge');
  assert.doesNotThrow(() => checkFileSize(MAX_IMPORT_BYTES));
  assert.doesNotThrow(() => checkFileSize(0));
  assert.doesNotThrow(() => checkFileSize(Number.NaN));
});

// ------------------------------------------------------------ prototype safety

/* The whole reason every field is picked by name. */
test('a __proto__ key in the file pollutes nothing', () => {
  const hostile =
    '{"format":"waypoints-export","version":1,"memories":[' +
    '{"__proto__":{"polluted":"yes"},"id":"m1","title":"T","note":"","date":"2025-01-01",' +
    '"lat":1,"lng":2,"placeName":"","tags":[],"photoIds":[],' +
    '"createdAt":"2025-01-01T00:00:00.000Z","updatedAt":"2025-01-01T00:00:00.000Z"}],"photos":[]}';

  const plan = planImport(readEnvelope(hostile), {});

  assert.equal(plan.counts.added, 1, 'the memory itself is still usable');
  assert.equal({}.polluted, undefined, 'Object.prototype was touched');
  assert.equal(plan.records[0].polluted, undefined);
  assert.equal(Object.hasOwn(plan.records[0], '__proto__'), false);
  assert.equal(Object.getPrototypeOf(plan.records[0]), Object.prototype);
});

test('a constructor or prototype key in the file is ignored', () => {
  const hostile =
    '{"format":"waypoints-export","version":1,"memories":[' +
    '{"constructor":{"x":1},"prototype":{"y":2},"id":"m1","title":"T","note":"","date":"2025-01-01",' +
    '"lat":1,"lng":2,"placeName":"","tags":[],"photoIds":[],' +
    '"createdAt":"2025-01-01T00:00:00.000Z","updatedAt":"2025-01-01T00:00:00.000Z"}],"photos":[]}';

  const plan = planImport(readEnvelope(hostile), {});

  assert.equal(plan.counts.added, 1);
  assert.equal(Object.hasOwn(plan.records[0], 'prototype'), false);
  assert.equal(typeof plan.records[0].constructor, 'function', 'still the ordinary constructor');
});

test('a __proto__ key on a photo pollutes nothing', () => {
  const hostile =
    '{"format":"waypoints-export","version":1,"memories":[],"photos":[' +
    '{"__proto__":{"polluted2":"yes"},"id":"p1","mime":"image/jpeg","width":10,"height":10,' +
    '"createdAt":"x","data":"AQID","thumb":""}]}';

  planImport(readEnvelope(hostile), {});

  assert.equal({}.polluted2, undefined);
});

test('a record carries only the known fields, whatever else the file had', () => {
  const plan = planImport(
    readEnvelope(text(envelope({ memories: [{ ...memory(), extra: 'nope', lat2: 9 }] }))),
    {}
  );

  assert.deepEqual(Object.keys(plan.records[0]).sort(), [
    'createdAt',
    'date',
    'id',
    'lat',
    'lng',
    'note',
    'photoIds',
    'placeName',
    'tags',
    'title',
    'updatedAt'
  ]);
});

// ------------------------------------------------------------ memory validation

test('an invalid memory is skipped with a reason, not fatal', () => {
  const plan = planImport(
    readEnvelope(text(envelope({ memories: [memory(), memory({ id: 'bad', title: '' })] }))),
    {}
  );

  assert.equal(plan.counts.added, 1);
  assert.equal(plan.skippedMemories.length, 1);
  assert.equal(plan.skippedMemories[0].id, 'bad');
  assert.match(plan.skippedMemories[0].reason, /Title/);
});

test('every wrong type is reported rather than thrown', () => {
  const broken = [
    memory({ id: 'a', title: 42 }),
    memory({ id: 'b', note: [] }),
    memory({ id: 'c', date: '04/03/2025' }),
    memory({ id: 'd', date: '2025-02-30' }),
    memory({ id: 'e', lat: 'north' }),
    memory({ id: 'f', lng: null }),
    memory({ id: 'g', lat: 900 }),
    memory({ id: 'h', placeName: 7 }),
    memory({ id: 'i', tags: 'trail' }),
    memory({ id: 'j', photoIds: 'p1' }),
    memory({ id: 'k', createdAt: 'yesterday' }),
    memory({ id: 'l', updatedAt: null }),
    memory({ id: '' }),
    memory({ id: null })
  ];

  const plan = planImport(readEnvelope(text(envelope({ memories: broken }))), {});

  assert.equal(plan.counts.added, 0, 'none of these should be usable');
  assert.equal(plan.skippedMemories.length, broken.length);
  for (const entry of plan.skippedMemories) {
    assert.ok(entry.reason.length > 0, 'every skip needs a reason');
  }
});

/* validateMemory reads tag.length with no type check, so a null tag would throw outright if
   the picker let it past. */
test('a null inside tags or photoIds is reported, not thrown', () => {
  const plan = planImport(
    readEnvelope(
      text(
        envelope({
          memories: [memory({ id: 'a', tags: [null] }), memory({ id: 'b', photoIds: [null] })]
        })
      )
    ),
    {}
  );

  assert.equal(plan.counts.added, 0);
  assert.equal(plan.skippedMemories.length, 2);
});

test('a mixed-type tag array is rejected rather than quietly filtered', () => {
  const plan = planImport(
    readEnvelope(text(envelope({ memories: [memory({ tags: ['trail', 5] })] }))),
    {}
  );

  assert.equal(plan.counts.added, 0);
  assert.match(plan.skippedMemories[0].reason, /Tags/);
});

test('an oversized string is reported', () => {
  const plan = planImport(
    readEnvelope(
      text(
        envelope({
          memories: [
            memory({ id: 'a', title: 'x'.repeat(5000) }),
            memory({ id: 'b', note: 'x'.repeat(6000) }),
            memory({ id: 'c', placeName: 'x'.repeat(400) }),
            memory({ id: 'd', tags: ['x'.repeat(60)] }),
            memory({ id: 'e', tags: Array.from({ length: 40 }, (_, i) => 't' + i) })
          ]
        })
      )
    ),
    {}
  );

  assert.equal(plan.counts.added, 0);
  assert.equal(plan.skippedMemories.length, 5);
});

test('an entry that is not an object at all is skipped', () => {
  const plan = planImport(
    readEnvelope(text(envelope({ memories: [null, 42, 'nope', [], memory()] }))),
    {}
  );

  assert.equal(plan.counts.added, 1);
  assert.equal(plan.skippedMemories.length, 4);
});

// -------------------------------------------------------------- duplicate ids

test('a duplicate id in the file keeps the first and reports the rest', () => {
  const plan = planImport(
    readEnvelope(
      text(
        envelope({
          memories: [
            memory({ title: 'First' }),
            memory({ title: 'Second' }),
            memory({ title: 'Third' })
          ]
        })
      )
    ),
    {}
  );

  assert.equal(plan.counts.added, 1);
  assert.equal(plan.records[0].title, 'First');
  assert.equal(plan.skippedMemories.length, 2);
  for (const entry of plan.skippedMemories) {
    assert.match(entry.reason, /duplicate/i);
  }
});

/* Deduped after validation, so a broken first copy cannot shadow a good second one. */
test('a broken duplicate does not shadow a usable one', () => {
  const plan = planImport(
    readEnvelope(
      text(envelope({ memories: [memory({ title: '' }), memory({ title: 'Good one' })] }))
    ),
    {}
  );

  assert.equal(plan.counts.added, 1);
  assert.equal(plan.records[0].title, 'Good one');
});

// -------------------------------------------------------------------- photos

test('a usable photo is queued for writing', () => {
  const plan = planImport(
    readEnvelope(text(envelope({ memories: [memory({ photoIds: ['p1'] })], photos: [photo()] }))),
    {}
  );

  assert.equal(plan.counts.photosToWrite, 1);
  assert.equal(plan.photosToWrite[0].id, 'p1');
  assert.deepEqual(plan.records[0].photoIds, ['p1']);
});

test('rejects a photo whose type is not an allowed image', () => {
  for (const mime of ['image/gif', 'text/plain', 'application/json', '', null, undefined, 42]) {
    const plan = planImport(
      readEnvelope(
        text(envelope({ memories: [memory({ photoIds: ['p1'] })], photos: [photo({ mime })] }))
      ),
      {}
    );

    assert.equal(plan.counts.photosToWrite, 0, String(mime));
    assert.match(plan.skippedPhotos[0].reason, /allowed image type/);
  }
});

test('accepts each allowed image type', () => {
  for (const mime of ['image/jpeg', 'image/png', 'image/webp']) {
    const plan = planImport(
      readEnvelope(
        text(envelope({ memories: [memory({ photoIds: ['p1'] })], photos: [photo({ mime })] }))
      ),
      {}
    );

    assert.equal(plan.counts.photosToWrite, 1, mime);
  }
});

test('rejects a photo whose data is not clean base64', () => {
  for (const data of ['not base64!', 'AQID=', '====', '', null, 42, 'AQI']) {
    const plan = planImport(
      readEnvelope(
        text(envelope({ memories: [memory({ photoIds: ['p1'] })], photos: [photo({ data })] }))
      ),
      {}
    );

    assert.equal(plan.counts.photosToWrite, 0, JSON.stringify(data));
    assert.match(plan.skippedPhotos[0].reason, /base64/);
  }
});

test('rejects a photo with a broken thumbnail', () => {
  const plan = planImport(
    readEnvelope(
      text(
        envelope({
          memories: [memory({ photoIds: ['p1'] })],
          photos: [photo({ thumb: 'not base64!' })]
        })
      )
    ),
    {}
  );

  assert.equal(plan.counts.photosToWrite, 0);
  assert.match(plan.skippedPhotos[0].reason, /thumbnail/);
});

test('an empty thumbnail is allowed', () => {
  const plan = planImport(
    readEnvelope(
      text(envelope({ memories: [memory({ photoIds: ['p1'] })], photos: [photo({ thumb: '' })] }))
    ),
    {}
  );

  assert.equal(plan.counts.photosToWrite, 1);
});

test('rejects a photo over the decoded size limit', () => {
  const huge = bytesToBase64(new Uint8Array(MAX_PHOTO_BYTES + 1024));
  const plan = planImport(
    readEnvelope(
      text(envelope({ memories: [memory({ photoIds: ['p1'] })], photos: [photo({ data: huge })] }))
    ),
    {}
  );

  assert.equal(plan.counts.photosToWrite, 0);
  assert.match(plan.skippedPhotos[0].reason, /over the 10MB limit/);
});

test('rejects a photo with no usable dimensions', () => {
  for (const overrides of [{ width: 0 }, { height: -5 }, { width: 'wide' }, { height: null }]) {
    const plan = planImport(
      readEnvelope(
        text(
          envelope({ memories: [memory({ photoIds: ['p1'] })], photos: [photo(overrides)] })
        )
      ),
      {}
    );

    assert.equal(plan.counts.photosToWrite, 0, JSON.stringify(overrides));
    assert.match(plan.skippedPhotos[0].reason, /dimensions/);
  }
});

test('rejects a photo with no id', () => {
  const plan = planImport(
    readEnvelope(text(envelope({ photos: [photo({ id: '' }), photo({ id: null })] }))),
    {}
  );

  assert.equal(plan.counts.photosToWrite, 0);
  assert.equal(plan.skippedPhotos.length, 2);
});

test('a duplicate photo id in the file keeps the first', () => {
  const plan = planImport(
    readEnvelope(
      text(
        envelope({
          memories: [memory({ photoIds: ['p1'] })],
          photos: [photo({ width: 100 }), photo({ width: 200 })]
        })
      )
    ),
    {}
  );

  assert.equal(plan.counts.photosToWrite, 1);
  assert.equal(plan.photosToWrite[0].width, 100);
  assert.match(plan.skippedPhotos[0].reason, /duplicate/i);
});

// ------------------------------------------------------------- reconciliation

test('a reference to a photo in neither the file nor the store is dropped and reported', () => {
  const plan = planImport(
    readEnvelope(text(envelope({ memories: [memory({ photoIds: ['gone'] })] }))),
    { existingPhotoIds: [] }
  );

  assert.deepEqual(plan.records[0].photoIds, []);
  assert.equal(plan.counts.droppedReferences, 1);
  assert.deepEqual(plan.droppedReferences, [{ id: 'm1', photoIds: ['gone'] }]);
});

/* An export taken without photos still carries photoIds, and the blobs may well be here. */
test('a reference to a photo already in the store is kept', () => {
  const plan = planImport(
    readEnvelope(text(envelope({ memories: [memory({ photoIds: ['local1'] })], photos: [] }))),
    { existingPhotoIds: ['local1'] }
  );

  assert.deepEqual(plan.records[0].photoIds, ['local1']);
  assert.equal(plan.counts.droppedReferences, 0);
  assert.equal(plan.counts.photosToWrite, 0);
});

test('only the missing references are dropped, not the whole list', () => {
  const plan = planImport(
    readEnvelope(
      text(
        envelope({
          memories: [memory({ photoIds: ['p1', 'gone', 'local1'] })],
          photos: [photo()]
        })
      )
    ),
    { existingPhotoIds: ['local1'] }
  );

  assert.deepEqual(plan.records[0].photoIds, ['p1', 'local1']);
  assert.deepEqual(plan.droppedReferences, [{ id: 'm1', photoIds: ['gone'] }]);
});

test('a photo no imported memory refers to is skipped', () => {
  const plan = planImport(
    readEnvelope(
      text(envelope({ memories: [memory({ photoIds: [] })], photos: [photo({ id: 'orphan' })] }))
    ),
    {}
  );

  assert.equal(plan.counts.photosToWrite, 0);
  assert.match(plan.skippedPhotos[0].reason, /no imported memory/);
});

test('a photo already in the store is skipped as already present', () => {
  const plan = planImport(
    readEnvelope(text(envelope({ memories: [memory({ photoIds: ['p1'] })], photos: [photo()] }))),
    { existingPhotoIds: ['p1'] }
  );

  assert.equal(plan.counts.photosToWrite, 0);
  assert.match(plan.skippedPhotos[0].reason, /already here/);
});

test('a photo referenced only by a memory that will be left unchanged is still written', () => {
  const plan = planImport(
    readEnvelope(text(envelope({ memories: [memory({ photoIds: ['p1'] })], photos: [photo()] }))),
    { existingMemories: [memory({ photoIds: ['p1'] })], existingPhotoIds: [] }
  );

  assert.equal(plan.counts.unchanged, 1);
  assert.equal(plan.counts.photosToWrite, 1, 'the missing blob is repaired');
});

// --------------------------------------------------------------- merge preview

test('an unknown id counts as added', () => {
  const plan = planImport(readEnvelope(text(envelope({ memories: [memory()] }))), {
    existingMemories: []
  });

  assert.deepEqual(plan.counts, {
    added: 1,
    updated: 0,
    unchanged: 0,
    skippedMemories: 0,
    skippedPhotos: 0,
    photosToWrite: 0,
    droppedReferences: 0
  });
});

test('a newer updatedAt counts as updated', () => {
  const plan = planImport(
    readEnvelope(text(envelope({ memories: [memory({ updatedAt: '2026-01-01T00:00:00.000Z' })] }))),
    { existingMemories: [memory({ updatedAt: '2025-03-04T09:00:00.000Z' })] }
  );

  assert.equal(plan.counts.updated, 1);
  assert.equal(plan.counts.added, 0);
});

test('an older updatedAt counts as unchanged', () => {
  const plan = planImport(
    readEnvelope(text(envelope({ memories: [memory({ updatedAt: '2024-01-01T00:00:00.000Z' })] }))),
    { existingMemories: [memory({ updatedAt: '2025-03-04T09:00:00.000Z' })] }
  );

  assert.equal(plan.counts.unchanged, 1);
  assert.equal(plan.counts.updated, 0);
});

test('an identical updatedAt counts as unchanged', () => {
  const plan = planImport(readEnvelope(text(envelope({ memories: [memory()] }))), {
    existingMemories: [memory()]
  });

  assert.equal(plan.counts.unchanged, 1);
});

test('an empty export is a valid no-op', () => {
  const plan = planImport(readEnvelope(text(envelope())), { existingMemories: [memory()] });

  assert.deepEqual(plan.records, []);
  assert.equal(plan.counts.added, 0);
  assert.equal(plan.counts.skippedMemories, 0);
});

test('readImport does the whole thing in one call', () => {
  const plan = readImport(text(envelope({ memories: [memory()] })), { existingMemories: [] });

  assert.equal(plan.counts.added, 1);
});

test('a mixed file reports every category at once', () => {
  const plan = readImport(
    text(
      envelope({
        memories: [
          memory({ id: 'new' }),
          memory({ id: 'newer', updatedAt: '2026-01-01T00:00:00.000Z' }),
          memory({ id: 'older', updatedAt: '2024-01-01T00:00:00.000Z' }),
          memory({ id: 'broken', title: '' }),
          memory({ id: 'new' })
        ],
        photos: [photo({ id: 'used' }), photo({ id: 'orphan' })]
      })
    ),
    {
      existingMemories: [
        memory({ id: 'newer', updatedAt: '2025-01-01T00:00:00.000Z' }),
        memory({ id: 'older', updatedAt: '2025-01-01T00:00:00.000Z' })
      ],
      existingPhotoIds: []
    }
  );

  assert.equal(plan.counts.added, 1, 'new');
  assert.equal(plan.counts.updated, 1, 'newer');
  assert.equal(plan.counts.unchanged, 1, 'older');
  assert.equal(plan.counts.skippedMemories, 2, 'broken plus the duplicate');
  assert.equal(plan.counts.photosToWrite, 0, 'neither photo is referenced');
});
