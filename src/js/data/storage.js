import { CORRUPT_KEY_PREFIX, STORAGE_KEY, STORAGE_VERSION } from './schema.js';
import { StorageFullError } from './errors.js';

/* The real names. Sandbox mode passes its own set instead, which is why these are a
   default argument rather than read straight from the module. */
export const DEFAULT_NAMES = Object.freeze({
  storageKey: STORAGE_KEY,
  corruptKeyPrefix: CORRUPT_KEY_PREFIX
});

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

function backupCorruptValue(storage, raw, now, corruptKeyPrefix) {
  const key = corruptKeyPrefix + now().toISOString();
  try {
    storage.setItem(key, raw);
  } catch {
    /* The backup is best effort. If it fails there is nothing useful left to do, and
       throwing here would block the app from starting at all. */
  }
  return key;
}

export function readEnvelope(storage, now, names = DEFAULT_NAMES) {
  const raw = storage.getItem(names.storageKey);
  if (raw === null || raw === undefined || raw === '') {
    return createEmptyEnvelope();
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    backupCorruptValue(storage, raw, now, names.corruptKeyPrefix);
    return createEmptyEnvelope();
  }

  if (!isEnvelopeShape(parsed)) {
    backupCorruptValue(storage, raw, now, names.corruptKeyPrefix);
    return createEmptyEnvelope();
  }

  return { version: parsed.version ?? STORAGE_VERSION, memories: parsed.memories };
}

export function writeEnvelope(storage, memories, names = DEFAULT_NAMES) {
  const envelope = { version: STORAGE_VERSION, memories };
  try {
    storage.setItem(names.storageKey, JSON.stringify(envelope));
  } catch (error) {
    if (isQuotaError(error)) {
      throw new StorageFullError(error);
    }
    throw error;
  }
  return envelope;
}
