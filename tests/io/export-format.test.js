import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildExport,
  buildExportEnvelope,
  encodePhoto,
  exportFilename,
  EXPORT_FORMAT,
  EXPORT_VERSION,
  MEMORY_FIELDS
} from '../../src/js/io/export-format.js';
import { base64ToBytes } from '../../src/js/io/base64.js';

function memory(overrides = {}) {
  return {
    id: 'm1',
    title: 'Karura forest walk',
    note: 'Quiet',
    date: '2025-03-04',
    lat: -1.2359,
    lng: 36.8137,
    placeName: 'Karura',
    tags: ['trail', 'view'],
    photoIds: ['p1'],
    createdAt: '2025-03-04T09:00:00.000Z',
    updatedAt: '2025-03-04T09:00:00.000Z',
    ...overrides
  };
}

function photoRecord(id = 'p1') {
  return {
    id,
    blob: new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'image/jpeg' }),
    thumb: new Blob([new Uint8Array([9, 8, 7])], { type: 'image/jpeg' }),
    width: 1600,
    height: 1200,
    createdAt: '2025-03-04T09:00:00.000Z'
  };
}

test('the envelope carries the format and version', () => {
  const envelope = buildExportEnvelope({ exportedAt: new Date('2026-10-03T07:00:00.000Z') });

  assert.equal(envelope.format, EXPORT_FORMAT);
  assert.equal(envelope.version, EXPORT_VERSION);
  assert.equal(envelope.exportedAt, '2026-10-03T07:00:00.000Z');
});

test('the envelope has exactly the agreed keys', () => {
  assert.deepEqual(Object.keys(buildExportEnvelope({})).sort(), [
    'exportedAt',
    'format',
    'memories',
    'photos',
    'version'
  ]);
});

test('an empty collection exports empty arrays, not nothing', () => {
  const envelope = buildExportEnvelope({});

  assert.deepEqual(envelope.memories, []);
  assert.deepEqual(envelope.photos, []);
});

test('a memory exports exactly its known fields', () => {
  const envelope = buildExportEnvelope({ memories: [memory()] });

  assert.deepEqual(Object.keys(envelope.memories[0]), [...MEMORY_FIELDS]);
});

/* Whatever else has been hung off a record in memory must not travel into the file. */
test('an unexpected field on a record is not exported', () => {
  const envelope = buildExportEnvelope({
    memories: [memory({ secret: 'leak', __proto__: { polluted: true } })]
  });

  assert.equal('secret' in envelope.memories[0], false);
  assert.equal(Object.hasOwn(envelope.memories[0], 'polluted'), false);
});

test('values survive unchanged', () => {
  const source = memory();
  const exported = buildExportEnvelope({ memories: [source] }).memories[0];

  for (const field of MEMORY_FIELDS) {
    assert.deepEqual(exported[field], source[field], field);
  }
});

test('arrays are copied, not shared with the stored record', () => {
  const source = memory();
  const exported = buildExportEnvelope({ memories: [source] }).memories[0];

  exported.tags.push('mutated');

  assert.deepEqual(source.tags, ['trail', 'view']);
});

test('encodes a photo blob and its thumbnail', async () => {
  const encoded = await encodePhoto(photoRecord());

  assert.equal(encoded.id, 'p1');
  assert.equal(encoded.mime, 'image/jpeg');
  assert.equal(encoded.width, 1600);
  assert.equal(encoded.height, 1200);
  assert.deepEqual([...base64ToBytes(encoded.data)], [1, 2, 3, 4, 5]);
  assert.deepEqual([...base64ToBytes(encoded.thumb)], [9, 8, 7]);
});

test('an encoded photo has exactly the agreed keys', async () => {
  const encoded = await encodePhoto(photoRecord());

  assert.deepEqual(Object.keys(encoded).sort(), [
    'createdAt',
    'data',
    'height',
    'id',
    'mime',
    'thumb',
    'width'
  ]);
});

test('a photo with no thumbnail encodes an empty string rather than failing', async () => {
  const encoded = await encodePhoto({ ...photoRecord(), thumb: null });

  assert.equal(encoded.thumb, '');
});

test('the mime falls back when the blob has no type', async () => {
  const encoded = await encodePhoto({
    ...photoRecord(),
    blob: new Blob([new Uint8Array([1])])
  });

  assert.equal(encoded.mime, 'image/jpeg');
});

test('a full export includes the photos', async () => {
  const envelope = await buildExport({
    memories: [memory()],
    photoRecords: [photoRecord()],
    includePhotos: true,
    now: () => new Date('2026-10-03T07:00:00.000Z')
  });

  assert.equal(envelope.memories.length, 1);
  assert.equal(envelope.photos.length, 1);
  assert.equal(envelope.photos[0].id, 'p1');
});

/* Without photos the references stay, so an import can reconcile them against blobs the
   owner may still have locally rather than silently stripping them. */
test('leaving photos out keeps the photoIds on the memories', async () => {
  const envelope = await buildExport({
    memories: [memory()],
    photoRecords: [photoRecord()],
    includePhotos: false
  });

  assert.deepEqual(envelope.photos, []);
  assert.deepEqual(envelope.memories[0].photoIds, ['p1']);
});

test('the whole envelope survives JSON', async () => {
  const envelope = await buildExport({
    memories: [memory(), memory({ id: 'm2', tags: [], photoIds: [] })],
    photoRecords: [photoRecord()],
    now: () => new Date('2026-10-03T07:00:00.000Z')
  });

  assert.deepEqual(JSON.parse(JSON.stringify(envelope)), envelope);
});

/* Local date, not UTC: a file written on the evening of the 3rd must not be named the 4th. */
test('the filename uses the local date', () => {
  assert.equal(exportFilename(new Date(2026, 9, 3, 23, 30)), 'waypoints-export-2026-10-03.json');
  assert.equal(exportFilename(new Date(2026, 0, 1, 0, 1)), 'waypoints-export-2026-01-01.json');
});

test('the filename pads single digits', () => {
  assert.equal(exportFilename(new Date(2026, 2, 9)), 'waypoints-export-2026-03-09.json');
});

test('the filename does not drift by timezone', () => {
  const previous = process.env.TZ;

  try {
    for (const zone of ['UTC', 'Pacific/Niue', 'Pacific/Kiritimati']) {
      process.env.TZ = zone;
      /* Constructed from local parts, so it names the local day in every zone. */
      assert.equal(exportFilename(new Date(2026, 9, 3, 12)), 'waypoints-export-2026-10-03.json', zone);
    }
  } finally {
    process.env.TZ = previous;
  }
});
