import { bytesToBase64 } from './base64.js';

export const EXPORT_FORMAT = 'waypoints-export';
export const EXPORT_VERSION = 1;

/* The fields a stored memory is made of. Listed here so the export writes exactly these and
   nothing more, and so the importer has one place to agree with. */
const MEMORY_FIELDS = Object.freeze([
  'id',
  'title',
  'note',
  'date',
  'lat',
  'lng',
  'placeName',
  'tags',
  'photoIds',
  'createdAt',
  'updatedAt'
]);

const PHOTO_FIELDS = Object.freeze(['id', 'mime', 'width', 'height', 'createdAt']);

export { MEMORY_FIELDS, PHOTO_FIELDS };

function pickFields(source, fields) {
  const picked = {};

  for (const field of fields) {
    const value = source[field];
    picked[field] = Array.isArray(value) ? [...value] : value;
  }

  return picked;
}

/* Local date, not UTC: the filename is for the person doing the export, and a file written on
   the evening of the 3rd should not be named the 4th. Built from the parts rather than sliced
   out of toISOString, which is always UTC. */
export function exportFilename(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return 'waypoints-export-' + year + '-' + month + '-' + day + '.json';
}

/* Pure. Photos arrive already encoded, because turning a Blob into base64 is asynchronous and
   this has to stay testable without one. */
export function buildExportEnvelope({ memories = [], photos = [], exportedAt } = {}) {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: exportedAt instanceof Date ? exportedAt.toISOString() : String(exportedAt ?? ''),
    memories: memories.map((memory) => pickFields(memory, MEMORY_FIELDS)),
    photos: photos.map((photo) => ({
      ...pickFields(photo, PHOTO_FIELDS),
      data: photo.data,
      thumb: photo.thumb
    }))
  };
}

async function blobToBase64(blob) {
  if (!blob) {
    return '';
  }

  return bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
}

/* The one part that needs a Blob. Kept apart from the envelope builder so the shape of the file
   can be tested without encoding anything. */
export async function encodePhoto(record) {
  return {
    id: record.id,
    mime: record.blob?.type || 'image/jpeg',
    width: record.width,
    height: record.height,
    createdAt: record.createdAt,
    data: await blobToBase64(record.blob),
    thumb: await blobToBase64(record.thumb)
  };
}

/* photoIds are left on the memories even when photos are not included, so an import can
   reconcile them against whatever is already in the local store rather than silently
   stripping references the owner may still have the blobs for. */
export async function buildExport({ memories, photoRecords = [], includePhotos = true, now = () => new Date() }) {
  const photos = includePhotos ? await Promise.all(photoRecords.map(encodePhoto)) : [];

  return buildExportEnvelope({ memories, photos, exportedAt: now() });
}
