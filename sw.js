/* The service worker. A classic script, hand written, at the root so its scope is the whole
   app. It is deliberately the only file here that is not an ES module: importScripts cannot
   load one, and the version has to be known synchronously to name the cache. */

importScripts('./precache-manifest.js');

const CACHE_PREFIX = 'waypoints-';
const PRECACHE = CACHE_PREFIX + 'precache-' + self.PRECACHE_VERSION;

/* Tiles live apart from the precache and outlive it. They are not part of a version of the
   app - they are the same pictures whatever the app does - so throwing them away on every
   update would mean a blank map after each one, exactly when someone is least able to refill
   it. The name carries no version for the same reason. */
const TILE_CACHE = CACHE_PREFIX + 'tiles';

/* Suffixes rather than whole hosts: both providers serve from numbered or lettered subdomains
   (a-d for CARTO, a-c for OpenStreetMap), and matching the suffix covers all of them without
   writing each one out. */
const TILE_HOSTS = ['.basemaps.cartocdn.com', '.tile.openstreetmap.org'];

/* Roughly a screenful of tiles at a few zoom levels, which is what makes an offline map
   useful without letting a long session grow without limit. */
const TILE_CACHE_LIMIT = 300;

function isTile(url) {
  return TILE_HOSTS.some((host) => url.hostname.endsWith(host));
}

/* The page itself, whatever path a navigation asked for. */
const INDEX = new URL('index.html', self.location).href;

/* Absolute, because a fetch event carries an absolute url and the manifest lists relative
   paths. Built once: this runs on every request. */
const PRECACHED = new Set([
  ...self.PRECACHE_FILES.map((file) => new URL(file.url, self.location).href),
  ...self.PRECACHE_REMOTE
]);

/* ---------------------------------------------------------------- install */

async function fillPrecache() {
  const cache = await caches.open(PRECACHE);

  /* reload, not the default: an install that populated the cache from the browser's HTTP
     cache could store the very bytes the new version is meant to replace. */
  const local = self.PRECACHE_FILES.map((file) => new Request(file.url, { cache: 'reload' }));

  /* cors and not no-cors, matching the crossorigin attributes in index.html. A no-cors
     request would succeed and store an opaque response, which cannot be read back or checked
     for a status, so a cached error page would be indistinguishable from the library. */
  const remote = self.PRECACHE_REMOTE.map(
    (url) => new Request(url, { mode: 'cors', credentials: 'omit', cache: 'reload' })
  );

  /* addAll is all or nothing: one failed request or one non-ok status rejects the whole call,
     the cache is thrown away and the worker never installs. A half-filled precache would be
     worse than none, because the app would boot offline and then fail on one module. */
  await cache.addAll([...local, ...remote]);
}

self.addEventListener('install', (event) => {
  /* No skipWaiting here. A new worker takes over only when the page asks it to, so a running
     session is never swapped underneath itself onto a different set of modules. */
  event.waitUntil(fillPrecache());
});

/* --------------------------------------------------------------- activate */

async function dropOldCaches() {
  const names = await caches.keys();

  await Promise.all(
    names
      /* The tile cache is kept: it is not a version of the app. */
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== PRECACHE && name !== TILE_CACHE)
      .map((name) => caches.delete(name))
  );
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    dropOldCaches().then(() =>
      /* So the worker controls the pages that are already open, rather than only the next
         navigation. The update flow reloads anyway; this is what makes a first visit work
         offline without one. */
      self.clients.claim()
    )
  );
});

/* ------------------------------------------------------------------ fetch */

async function fromPrecache(request) {
  const cache = await caches.open(PRECACHE);

  /* ignoreVary: jsDelivr answers with Vary: Accept-Encoding, and a stored response whose
     encoding was negotiated differently would otherwise never match. */
  const cached = await cache.match(request, { ignoreVary: true });

  return cached ?? fetch(request);
}

/* Oldest first. Cache.keys resolves in insertion order, so the front of the list is the least
   recently added and trimming from there is enough - no timestamps to store and keep in step.
   Run after the response is stored, so a trim that fails never costs the tile. */
async function trimTileCache(cache) {
  const keys = await cache.keys();
  const excess = keys.length - TILE_CACHE_LIMIT;

  for (let index = 0; index < excess; index++) {
    await cache.delete(keys[index]);
  }
}

/* Stale while revalidate: the cached tile is served straight away and a fresh one is fetched
   in the background for next time. A tile is immutable in practice, so the staleness costs
   nothing, and the map draws instantly on a slow connection instead of waiting on the
   network. */
async function serveTile(event) {
  const cache = await caches.open(TILE_CACHE);
  const cached = await cache.match(event.request);

  const update = fetch(event.request)
    .then(async (response) => {
      /* Readable because the tile layers ask for CORS: Leaflet leaves crossOrigin off by
         default, and an opaque response has status 0, so this check would reject every tile
         and silently cache nothing. */
      if (response.ok) {
        await cache.put(event.request, response.clone());
        await trimTileCache(cache);
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    /* Keeps the worker alive for the background fetch, which would otherwise be cut off the
       moment the cached response is returned. */
    event.waitUntil(update);
    return cached;
  }

  const fresh = await update;
  return fresh ?? Response.error();
}

async function serveNavigation(request) {
  const cache = await caches.open(PRECACHE);
  const cached = await cache.match(INDEX, { ignoreSearch: true });

  if (cached) {
    return cached;
  }

  try {
    return await fetch(request);
  } catch {
    return new Response('waypoints is offline and has nothing cached yet.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

self.addEventListener('fetch', (event) => {
  /* Untouched. A POST has no place in a cache, and responding to one from here would only add
     a way to get it wrong. */
  if (event.request.method !== 'GET') {
    return;
  }

  /* Every route is the same page: the app reads its own query string. */
  if (event.request.mode === 'navigate') {
    event.respondWith(serveNavigation(event.request));
    return;
  }

  if (PRECACHED.has(event.request.url)) {
    event.respondWith(fromPrecache(event.request));
    return;
  }

  if (isTile(new URL(event.request.url))) {
    event.respondWith(serveTile(event));
    return;
  }

  /* Everything else is left alone, Nominatim above all. A cached geocode would be a stale
     answer to a question about the world, and serving one offline instead of failing would
     make the app lie rather than say it cannot reach the service. Not calling respondWith is
     the difference between "the worker fetched it for you" and "the worker was never
     involved", and here the second is what we want. */
});

/* ---------------------------------------------------------------- message */

self.addEventListener('message', (event) => {
  /* The page's half of the update flow: the toast's Reload button sends this, the worker
     activates, and controllerchange on the page triggers the reload. */
  if (event.data === 'skip-waiting') {
    self.skipWaiting();
  }
});
