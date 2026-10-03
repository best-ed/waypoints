import { CORRUPT_KEY_PREFIX, STORAGE_KEY } from '../data/schema.js';
import { SETTINGS_KEY } from '../data/settings-store.js';
import { DATABASE_NAME } from '../photos/indexeddb-backend.js';

export const SANDBOX_PARAM = 'sandbox';

const SANDBOX_STORAGE_KEY = 'waypoints:sandbox:v1';
const SANDBOX_DATABASE_NAME = 'waypoints-sandbox';

export function isSandbox(search) {
  return new URLSearchParams(search ?? '').has(SANDBOX_PARAM);
}

/* Every name the app persists under comes from this one function, so sandbox mode cannot
   half-apply. There is deliberately no path that reads the real localStorage key while
   writing the sandbox database, which is the way a seeding helper would otherwise destroy
   real memories. */
export function storageNamesFor(sandbox) {
  if (sandbox) {
    return {
      storageKey: SANDBOX_STORAGE_KEY,
      corruptKeyPrefix: SANDBOX_STORAGE_KEY + ':corrupt-',
      databaseName: SANDBOX_DATABASE_NAME,
      settingsKey: 'waypoints:sandbox:settings'
    };
  }

  return {
    storageKey: STORAGE_KEY,
    corruptKeyPrefix: CORRUPT_KEY_PREFIX,
    databaseName: DATABASE_NAME,
    settingsKey: SETTINGS_KEY
  };
}

/* The filters rewrite the query string on every change, so ?sandbox has to be put back or a
   single keystroke would drop the session onto the real data. Written as a bare key rather
   than through URLSearchParams, which cannot express one. */
export function buildSearch(filterParams, sandbox) {
  const parts = [];

  if (sandbox) {
    parts.push(SANDBOX_PARAM);
  }

  if (typeof filterParams === 'string' && filterParams !== '') {
    parts.push(filterParams);
  }

  return parts.length === 0 ? '' : '?' + parts.join('&');
}
