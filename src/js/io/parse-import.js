import { validateStoredMemory } from '../data/validate.js';
import { base64ByteLength, isBase64 } from './base64.js';
import { EXPORT_FORMAT, EXPORT_VERSION, MEMORY_FIELDS } from './export-format.js';

/* A whole collection with photos can be large, but a quarter of a gigabyte of JSON is not a
   waypoints export, and reading it would lock the tab before anything could be checked. */
export const MAX_IMPORT_BYTES = 250 * 1024 * 1024;

/* The photo pipeline caps a stored image well below this. Anything bigger is either not an
   image or not one worth keeping. */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export const SUPPORTED_VERSIONS = Object.freeze([1]);
export const ALLOWED_PHOTO_MIMES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);

export class ImportError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = 'ImportError';
    this.kind = kind;
  }
}

const MESSAGES = {
  tooLarge: 'That file is larger than 250MB, which is bigger than any waypoints export.',
  notJson: 'That file is not valid JSON, so it cannot be read.',
  notAnEnvelope: 'That file does not contain a waypoints export.',
  wrongFormat: 'That file is not a waypoints export.',
  newerVersion:
    'That file was made by a newer version of waypoints. Update waypoints and try again.',
  unsupportedVersion: 'That export version cannot be read by this version of waypoints.',
  badMemories: 'That export has no list of memories in it.'
};

/* One entry per old version, each turning its envelope into the next version up. Empty while
   version 1 is current; a version 2 file would get an entry keyed 2 that reshapes it into a 1.
   migrate() walks the chain, so adding a step is the only change a new version needs. */
const MIGRATIONS = new Map();

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value) {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/* A mixed array is rejected whole rather than filtered, so the problem is reported instead of
   silently changing what the file said. It also keeps validateMemory safe: that reads
   tag.length without a type check, which throws outright on a null tag. */
function asStringArray(value) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.every((entry) => typeof entry === 'string') ? [...value] : undefined;
}

export function checkFileSize(byteLength) {
  if (Number.isFinite(byteLength) && byteLength > MAX_IMPORT_BYTES) {
    throw new ImportError('tooLarge', MESSAGES.tooLarge);
  }
}

function migrate(envelope) {
  let current = envelope;

  while (current.version !== EXPORT_VERSION) {
    const step = MIGRATIONS.get(current.version);
    if (!step) {
      throw new ImportError('unsupportedVersion', MESSAGES.unsupportedVersion);
    }
    current = step(current);
  }

  return current;
}

/* Reads the envelope and nothing more: the memories and photos arrays are handed on untouched
   for planImport to pick apart field by field. */
export function readEnvelope(text) {
  let parsed;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ImportError('notJson', MESSAGES.notJson);
  }

  if (!isPlainObject(parsed)) {
    throw new ImportError('notAnEnvelope', MESSAGES.notAnEnvelope);
  }

  if (parsed.format !== EXPORT_FORMAT) {
    throw new ImportError('wrongFormat', MESSAGES.wrongFormat);
  }

  if (!Number.isInteger(parsed.version)) {
    throw new ImportError('unsupportedVersion', MESSAGES.unsupportedVersion);
  }

  /* A newer version gets its own message, because the answer is to update rather than to go
     looking for what is wrong with the file. */
  if (parsed.version > EXPORT_VERSION) {
    throw new ImportError('newerVersion', MESSAGES.newerVersion);
  }

  if (!SUPPORTED_VERSIONS.includes(parsed.version) && !MIGRATIONS.has(parsed.version)) {
    throw new ImportError('unsupportedVersion', MESSAGES.unsupportedVersion);
  }

  if (!Array.isArray(parsed.memories)) {
    throw new ImportError('badMemories', MESSAGES.badMemories);
  }

  const migrated = migrate(parsed);

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: asString(migrated.exportedAt) ?? '',
    memories: Array.isArray(migrated.memories) ? migrated.memories : [],
    /* A file with no photos array is a perfectly good metadata-only export. */
    photos: Array.isArray(migrated.photos) ? migrated.photos : []
  };
}

/* Every field is named. Nothing is spread, assigned or copied wholesale from the parsed
   object, so a "__proto__" or "constructor" key in the file is never read and never written:
   it is simply not one of the names asked for. */
function pickMemory(raw) {
  if (!isPlainObject(raw)) {
    return null;
  }

  return {
    id: asString(raw.id),
    title: asString(raw.title),
    note: asString(raw.note),
    date: asString(raw.date),
    lat: asNumber(raw.lat),
    lng: asNumber(raw.lng),
    placeName: asString(raw.placeName),
    tags: asStringArray(raw.tags),
    photoIds: asStringArray(raw.photoIds),
    createdAt: asString(raw.createdAt),
    updatedAt: asString(raw.updatedAt)
  };
}

function withPhotoIds(memory, photoIds) {
  const rebuilt = {};
  for (const field of MEMORY_FIELDS) {
    rebuilt[field] = memory[field];
  }
  rebuilt.photoIds = photoIds;
  return rebuilt;
}

function pickPhoto(raw) {
  if (!isPlainObject(raw)) {
    return { ok: false, id: null, reason: 'the entry is not an object' };
  }

  const id = asString(raw.id);
  if (!id || id.trim() === '') {
    return { ok: false, id: null, reason: 'the photo has no id' };
  }

  const mime = asString(raw.mime);
  if (!ALLOWED_PHOTO_MIMES.includes(mime)) {
    return { ok: false, id, reason: 'the type ' + JSON.stringify(mime ?? null) + ' is not an allowed image type' };
  }

  const data = asString(raw.data);
  if (!isBase64(data) || data === '') {
    return { ok: false, id, reason: 'the image data is not valid base64' };
  }

  const bytes = base64ByteLength(data);
  if (bytes > MAX_PHOTO_BYTES) {
    return { ok: false, id, reason: 'the image is ' + Math.round(bytes / 1024 / 1024) + 'MB, over the 10MB limit' };
  }

  const thumb = asString(raw.thumb) ?? '';
  if (thumb !== '' && (!isBase64(thumb) || base64ByteLength(thumb) > MAX_PHOTO_BYTES)) {
    return { ok: false, id, reason: 'the thumbnail data is not valid base64' };
  }

  const width = asNumber(raw.width);
  const height = asNumber(raw.height);
  if (!width || !height || width <= 0 || height <= 0) {
    return { ok: false, id, reason: 'the image has no usable dimensions' };
  }

  return {
    ok: true,
    photo: {
      id,
      mime,
      width,
      height,
      createdAt: asString(raw.createdAt) ?? '',
      data,
      thumb
    }
  };
}

function describeErrors(errors) {
  return Object.values(errors).join(' ');
}

function label(id, index, noun) {
  return id && id.trim() !== '' ? id : '(' + noun + ' ' + (index + 1) + ' in the file)';
}

/* Everything is decided here, before a single byte is written: what would be added, updated or
   left alone, which entries are unusable and why, and which photos actually need writing. The
   caller shows this as a preview and only then commits. */
export function planImport(envelope, { existingMemories = [], existingPhotoIds = [] } = {}) {
  const existingById = new Map(existingMemories.map((memory) => [memory.id, memory]));
  const localPhotoIds = new Set(existingPhotoIds);

  const skippedMemories = [];
  const seenIds = new Set();
  const usable = [];

  envelope.memories.forEach((raw, index) => {
    const picked = pickMemory(raw);

    if (!picked) {
      skippedMemories.push({ id: label(null, index, 'memory'), reason: 'the entry is not an object' });
      return;
    }

    const { valid, errors } = validateStoredMemory(picked);
    if (!valid) {
      skippedMemories.push({ id: label(picked.id, index, 'memory'), reason: describeErrors(errors) });
      return;
    }

    /* Deduped after validation, so the first *usable* entry wins rather than the first entry
       being allowed to shadow a good one with a broken duplicate. */
    if (seenIds.has(picked.id)) {
      skippedMemories.push({ id: picked.id, reason: 'a duplicate of an earlier memory in the file' });
      return;
    }

    seenIds.add(picked.id);
    usable.push(picked);
  });

  const filePhotos = new Map();
  const skippedPhotos = [];

  envelope.photos.forEach((raw, index) => {
    const result = pickPhoto(raw);

    if (!result.ok) {
      skippedPhotos.push({ id: label(result.id, index, 'photo'), reason: result.reason });
      return;
    }

    if (filePhotos.has(result.photo.id)) {
      skippedPhotos.push({ id: result.photo.id, reason: 'a duplicate of an earlier photo in the file' });
      return;
    }

    filePhotos.set(result.photo.id, result.photo);
  });

  /* A reference is good if the blob is in the file or already here. An export taken without
     photos relies entirely on the second half of that. */
  const available = new Set([...filePhotos.keys(), ...localPhotoIds]);
  const droppedReferences = [];

  const records = usable.map((memory) => {
    const kept = memory.photoIds.filter((photoId) => available.has(photoId));

    if (kept.length === memory.photoIds.length) {
      return memory;
    }

    droppedReferences.push({
      id: memory.id,
      photoIds: memory.photoIds.filter((photoId) => !available.has(photoId))
    });

    return withPhotoIds(memory, kept);
  });

  const added = [];
  const updated = [];
  const unchanged = [];

  for (const memory of records) {
    const existing = existingById.get(memory.id);

    if (!existing) {
      added.push(memory);
    } else if (memory.updatedAt > existing.updatedAt) {
      updated.push(memory);
    } else {
      unchanged.push(memory);
    }
  }

  /* Referenced by any usable memory, including one that will be left unchanged: if its blob is
     missing here but present in the file, writing it repairs the gap. */
  const referenced = new Set(records.flatMap((memory) => memory.photoIds));
  const photosToWrite = [];

  for (const [photoId, photo] of filePhotos) {
    if (!referenced.has(photoId)) {
      skippedPhotos.push({ id: photoId, reason: 'no imported memory refers to it' });
      continue;
    }

    if (localPhotoIds.has(photoId)) {
      skippedPhotos.push({ id: photoId, reason: 'already here' });
      continue;
    }

    photosToWrite.push(photo);
  }

  return {
    records,
    added,
    updated,
    unchanged,
    photosToWrite,
    skippedMemories,
    skippedPhotos,
    droppedReferences,
    counts: {
      added: added.length,
      updated: updated.length,
      unchanged: unchanged.length,
      skippedMemories: skippedMemories.length,
      skippedPhotos: skippedPhotos.length,
      photosToWrite: photosToWrite.length,
      droppedReferences: droppedReferences.reduce((total, entry) => total + entry.photoIds.length, 0)
    }
  };
}

export function readImport(text, context) {
  return planImport(readEnvelope(text), context);
}
