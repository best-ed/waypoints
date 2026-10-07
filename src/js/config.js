/* Kept in step with package.json by tests/meta/version.test.js: two places is one too many,
   but the browser cannot read package.json and the deployment has no build step to write it
   in, so the test is what makes them one fact rather than two. */
export const APP_VERSION = '1.0.0';

export const MAP_CONTAINER_ID = 'map';

export const DEFAULT_VIEW = {
  center: [-1.2921, 36.8219],
  zoom: 12
};

export const MIN_ZOOM = 3;
export const MAX_ZOOM = 19;

/* OpenStreetMap standard, and only that.

   CARTO's Voyager and Dark Matter were here until release day, when every tile came back as a
   2049 byte "API KEY REQUIRED" watermark - verified directly against the provider, with and
   without a referer, while OpenStreetMap returned a real 45KB tile. CARTO now wants an account
   and a key for their basemaps, so shipping them would mean shipping a map nobody can read.

   Restoring them is a key away: put the two urls back here with the key in the query string
   and add the host to the policy in vercel.json and to TILE_HOSTS in sw.js. The dark basemap
   goes with them - no keyless provider offers one - so dark mode draws a light map, which is
   the honest trade rather than a broken one.

   Attribution is a condition of use, not decoration. Leaflet substitutes {r} with "@2x" on a
   retina screen by itself. */
export const BASEMAPS = Object.freeze({
  osm: Object.freeze({
    label: 'OpenStreetMap',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: MAX_ZOOM
  })
});

export const DEFAULT_BASEMAP_ID = 'osm';

/* Its own key. A display preference does not belong in the memories envelope. */
export const BASEMAP_STORAGE_KEY = 'waypoints:basemap';

/* Selecting a memory should get close enough to read the streets around it, but never
   zoom back out if the user is already closer in. */
export const SELECT_ZOOM = 14;

export const MAX_CLUSTER_RADIUS = 50;

/* Past this zoom the pins are far enough apart to read on their own, and a cluster here would
   hide the very pin someone zoomed in to find. Shared, because the reveal path relies on a
   marker being its own pin at this zoom. */
export const CLUSTER_DISABLE_ZOOM = 17;
