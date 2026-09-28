import { StorageFullError } from '../data/errors.js';

export const DATABASE_NAME = 'waypoints';
export const DATABASE_VERSION = 1;
export const PHOTO_STORE = 'photos';
export const PHOTO_KEY_PATH = 'id';

function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/* A write can fail on the transaction rather than the request, so both are watched: the
   request settles the value and the transaction settles the durability. */
function promisifyTransaction(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

function isQuotaError(error) {
  return Boolean(error) && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
}

function asStorageError(error) {
  return isQuotaError(error) ? new StorageFullError(error) : error;
}

export function createIndexedDbBackend({ indexedDb = indexedDB, storage = navigator.storage } = {}) {
  let openPromise = null;
  let persistenceRequested = false;

  function open() {
    if (!openPromise) {
      openPromise = new Promise((resolve, reject) => {
        const request = indexedDb.open(DATABASE_NAME, DATABASE_VERSION);

        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(PHOTO_STORE)) {
            db.createObjectStore(PHOTO_STORE, { keyPath: PHOTO_KEY_PATH });
          }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('The photo database is blocked by another tab'));
      });
    }
    return openPromise;
  }

  /* Asked for once, after the first photo is safely written, so the prompt only ever
     appears for someone who actually stored something. navigator.storage is missing in
     insecure contexts, so its absence is normal rather than an error. */
  async function requestPersistence() {
    if (persistenceRequested || !storage || typeof storage.persist !== 'function') {
      return;
    }
    persistenceRequested = true;

    try {
      await storage.persist();
    } catch {
      /* Persistence is an optimisation. Losing it must not fail the write. */
    }
  }

  async function withStore(mode, run) {
    const db = await open();
    const transaction = db.transaction(PHOTO_STORE, mode);
    const store = transaction.objectStore(PHOTO_STORE);

    try {
      const result = await run(store);
      await promisifyTransaction(transaction);
      return result;
    } catch (error) {
      throw asStorageError(error);
    }
  }

  async function put(record) {
    await withStore('readwrite', (store) => promisifyRequest(store.put(record)));
    await requestPersistence();
  }

  async function get(id) {
    const db = await open();
    const store = db.transaction(PHOTO_STORE, 'readonly').objectStore(PHOTO_STORE);
    return promisifyRequest(store.get(id));
  }

  async function remove(id) {
    await withStore('readwrite', (store) => promisifyRequest(store.delete(id)));
  }

  async function listIds() {
    const db = await open();
    const store = db.transaction(PHOTO_STORE, 'readonly').objectStore(PHOTO_STORE);
    const keys = await promisifyRequest(store.getAllKeys());
    return keys.map(String);
  }

  return { put, get, remove, listIds };
}
