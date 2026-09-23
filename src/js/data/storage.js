import { CORRUPT_KEY_PREFIX, STORAGE_KEY, STORAGE_VERSION } from './schema.js';
import { StorageFullError } from './errors.js';

export function createEmptyEnvelope() {
  return { version: STORAGE_VERSION, memories: [] };
}

function isEnvelopeShape(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Array.isArray(value.memories);
}

/* Browsers disagree on how a full quota surfaces: name differs by engine, and older
   builds only set a numeric code. */
function isQuotaError(error) {
  if (!error || typeof error !== 'object') {
    return false;
  }
  return (
    error.name === 'QuotaExceededError' ||
    error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    error.code === 22 ||
    error.code === 1014
  );
}

function backupCorruptValue(storage, raw, now) {
  const key = CORRUPT_KEY_PREFIX + now().toISOString();
  try {
    storage.setItem(key, raw);
  } catch {
    /* The backup is best effort. If it fails there is nothing useful left to do, and
       throwing here would block the app from starting at all. */
  }
  return key;
}

export function readEnvelope(storage, now) {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null || raw === undefined || raw === '') {
    return createEmptyEnvelope();
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    backupCorruptValue(storage, raw, now);
    return createEmptyEnvelope();
  }

  if (!isEnvelopeShape(parsed)) {
    backupCorruptValue(storage, raw, now);
    return createEmptyEnvelope();
  }

  return { version: parsed.version ?? STORAGE_VERSION, memories: parsed.memories };
}

export function writeEnvelope(storage, memories) {
  const envelope = { version: STORAGE_VERSION, memories };
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch (error) {
    if (isQuotaError(error)) {
      throw new StorageFullError(error);
    }
    throw error;
  }
  return envelope;
}
