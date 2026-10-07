/* Kept in step with package.json by tests/meta/version.test.js: two places is one too many,
   but the browser cannot read package.json and the deployment has no build step to write it
   in, so the test is what makes them one fact rather than two. */
export const APP_VERSION = '0.1.0';

export const MAP_CONTAINER_ID = 'map';

export const DEFAULT_VIEW = {
  center: [-1.2921, 36.8219],
  zoom: 12
};

export const MIN_ZOOM = 3;
export const MAX_ZOOM = 19;

/* Both providers require their attribution to stay visible; that is a condition of use, not
   decoration. Leaflet substitutes {r} with "@2x" on a retina screen by itself.
   The subdomains differ: CARTO serves a through d, and Leaflet defaults to a through c. */
export const BASEMAPS = Object.freeze({
  voyager: Object.freeze({
    label: 'Voyager',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    /* The same CARTO basemap drawn dark. Only this provider has one: OpenStreetMap standard
       has no dark counterpart, so it stays as it is in either theme. */
    darkUrl: 'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: MAX_ZOOM
  }),
  osm: Object.freeze({
    label: 'OpenStreetMap',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: MAX_ZOOM
  })
});

export const DEFAULT_BASEMAP_ID = 'voyager';

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
