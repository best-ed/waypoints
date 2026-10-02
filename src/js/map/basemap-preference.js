import { BASEMAPS, BASEMAP_STORAGE_KEY, DEFAULT_BASEMAP_ID } from '../config.js';

/* Pure, and with no Leaflet in it, so the fallback behaviour can be tested under node. The
   stored value is as untrusted as anything else a user can edit: a basemap that has since been
   removed, or a hand-typed key, falls back to the default rather than leaving a blank map. */
export function resolveBasemapId(value) {
  return typeof value === 'string' && Object.hasOwn(BASEMAPS, value) ? value : DEFAULT_BASEMAP_ID;
}

/* Its own key, deliberately not inside the memories envelope: a display preference is not
   user data, it should not be exported with memories, and a corrupt envelope must not take the
   basemap choice down with it. */
export function readBasemapId(storage) {
  try {
    return resolveBasemapId(storage.getItem(BASEMAP_STORAGE_KEY));
  } catch {
    /* Reading localStorage throws outright when site data is blocked. A default basemap is a
       far better outcome than a map that will not start. */
    return DEFAULT_BASEMAP_ID;
  }
}

export function writeBasemapId(storage, id) {
  try {
    storage.setItem(BASEMAP_STORAGE_KEY, resolveBasemapId(id));
    return true;
  } catch {
    /* A preference that cannot be remembered is not worth an error message. */
    return false;
  }
}
