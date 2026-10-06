import { OUTPUT_TYPE } from './photo-rules.js';

/* Photos are stored as ArrayBuffers rather than Blobs.

   Playwright's WebKit cannot put a Blob into IndexedDB at all - the transaction errors - and
   the same storage backend is what ships in Safari. Probed directly on that engine: a Blob
   fails, an ArrayBuffer, a Uint8Array and a string all succeed. Bytes are the shape every
   engine agrees on.

   This is the only place in the app that knows about it. The repository and everything above
   it still sees { id, blob, thumb, width, height, createdAt } with real Blobs, so the picker,
   the popup strip, the lightbox, export and import are all unchanged.

   No database version bump and no migration: reads accept either shape, so photos written
   before this keep working and are only rewritten if something writes them again. */

function bytesOf(blob) {
  return blob && typeof blob.arrayBuffer === 'function' ? blob.arrayBuffer() : Promise.resolve(null);
}

function typeOf(blob) {
  return blob && typeof blob.type === 'string' && blob.type !== '' ? blob.type : OUTPUT_TYPE;
}

/* Asynchronous because Blob.arrayBuffer is. The caller must await this *before* opening the
   transaction it writes in: awaiting a promise that is not an IndexedDB request lets the
   microtask queue drain, and the transaction auto-commits out from under the write. */
export async function serializePhotoRecord(record) {
  if (!record || typeof record !== 'object') {
    throw new TypeError('A photo record is required');
  }

  const [bytes, thumbBytes] = await Promise.all([bytesOf(record.blob), bytesOf(record.thumb)]);

  if (bytes === null) {
    throw new TypeError('Photo record is missing its image data');
  }

  return {
    id: record.id,
    bytes,
    type: typeOf(record.blob),
    thumbBytes,
    thumbType: thumbBytes === null ? '' : typeOf(record.thumb),
    width: record.width,
    height: record.height,
    createdAt: record.createdAt
  };
}

function toBlob(bytes, type) {
  if (!bytes) {
    return null;
  }

  return new Blob([bytes], { type: type || OUTPUT_TYPE });
}

/* Accepts both shapes. A legacy record already holds Blobs, so it is handed back as it is
   rather than round-tripped through bytes for no reason. */
export function deserializePhotoRecord(stored) {
  if (!stored || typeof stored !== 'object') {
    return null;
  }

  if (stored.bytes) {
    return {
      id: stored.id,
      blob: toBlob(stored.bytes, stored.type),
      thumb: toBlob(stored.thumbBytes, stored.thumbType),
      width: stored.width,
      height: stored.height,
      createdAt: stored.createdAt
    };
  }

  if (stored.blob) {
    return {
      id: stored.id,
      blob: stored.blob,
      thumb: stored.thumb ?? null,
      width: stored.width,
      height: stored.height,
      createdAt: stored.createdAt
    };
  }

  return null;
}
