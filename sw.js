/* The service worker. A classic script, hand written, at the root so its scope is the whole
   app. It is deliberately the only file here that is not an ES module: importScripts cannot
   load one, and the version has to be known synchronously to name the cache. */

importScripts('./precache-manifest.js');

const CACHE_PREFIX = 'waypoints-';
const PRECACHE = CACHE_PREFIX + 'precache-' + self.PRECACHE_VERSION;

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
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== PRECACHE)
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

  /* Everything else is left alone. Not calling respondWith is the difference between "the
     worker fetched it for you" and "the worker was never involved", and for anything we do
     not cache the second is what we want. */
});

/* ---------------------------------------------------------------- message */

self.addEventListener('message', (event) => {
  /* The page's half of the update flow: the toast's Reload button sends this, the worker
     activates, and controllerchange on the page triggers the reload. */
  if (event.data === 'skip-waiting') {
    self.skipWaiting();
  }
});
