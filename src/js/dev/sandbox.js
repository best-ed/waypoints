import { CORRUPT_KEY_PREFIX, STORAGE_KEY } from '../data/schema.js';
import { SETTINGS_KEY } from '../data/settings-store.js';
import { DATABASE_NAME } from '../photos/indexeddb-backend.js';

export const SANDBOX_PARAM = 'sandbox';

/* Opts a development host into registering the service worker. It lives here beside the
   sandbox flag because the two are the same kind of thing - a bare switch in the url that the
   filter sync has to put back - and buildSearch below is the one place that knows how. */
export const SW_PARAM = 'sw';

const SANDBOX_STORAGE_KEY = 'waypoints:sandbox:v1';
const SANDBOX_DATABASE_NAME = 'waypoints-sandbox';

export function isSandbox(search) {
  return new URLSearchParams(search ?? '').has(SANDBOX_PARAM);
}

export function wantsServiceWorker(search) {
  return new URLSearchParams(search ?? '').has(SW_PARAM);
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

/* The filters rewrite the query string on every change, so the bare flags have to be put back
   or a single keystroke would drop the session onto the real data, or off the service worker
   halfway through testing it. Written as bare keys rather than through URLSearchParams, which
   cannot express one. */
export function buildSearch(filterParams, { sandbox = false, sw = false } = {}) {
  const parts = [];

  if (sandbox) {
    parts.push(SANDBOX_PARAM);
  }

  if (sw) {
    parts.push(SW_PARAM);
  }

  if (typeof filterParams === 'string' && filterParams !== '') {
    parts.push(filterParams);
  }

  return parts.length === 0 ? '' : '?' + parts.join('&');
}
