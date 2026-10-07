import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { compileRules, compileSource, headersFor } from '../../scripts/serve.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const config = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
const rules = compileRules(config);

const headers = (pathname) => headersFor(rules, pathname);
const cacheFor = (pathname) => headers(pathname)['Cache-Control'];

/* The CSP, parsed into directives, so each one can be asserted on its own rather than by
   matching substrings of a very long string. */
const csp = Object.fromEntries(
  headers('/index.html')
    ['Content-Security-Policy'].split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [name, ...sources] = part.split(/\s+/);
      return [name, sources];
    })
);

/* ------------------------------------------------------------------ caching */

test('the entry point is never cached', () => {
  /* If index.html can be cached, an update is the cache's decision rather than ours. */
  assert.equal(cacheFor('/'), 'no-cache');
  assert.equal(cacheFor('/index.html'), 'no-cache');
});

test('the worker is never cached', () => {
  /* A cached sw.js is a worker that can never be replaced. */
  assert.equal(cacheFor('/sw.js'), 'no-cache');
});

test('the precache manifest is never cached', () => {
  /* It carries the version that names the cache; a stale copy pins the app to an old one. */
  assert.equal(cacheFor('/precache-manifest.js'), 'no-cache');
});

test('the web manifest is never cached', () => {
  assert.equal(cacheFor('/manifest.webmanifest'), 'no-cache');
});

test('application code revalidates rather than being pinned', () => {
  /* Nothing is fingerprinted, so a long cache here would strand someone on old modules. */
  for (const path of ['/src/js/main.js', '/src/css/tokens.css', '/src/js/data/schema.js']) {
    assert.match(cacheFor(path), /must-revalidate/, path);
    const seconds = Number(/max-age=(\d+)/.exec(cacheFor(path))[1]);
    assert.ok(seconds > 0 && seconds <= 3600, path + ' caches for ' + seconds + 's');
  }
});

test('icons are cached for a long time', () => {
  for (const path of ['/icons/icon-192.png', '/icons/icon.svg']) {
    const seconds = Number(/max-age=(\d+)/.exec(cacheFor(path))[1]);
    assert.ok(seconds >= 86400, path + ' caches for only ' + seconds + 's');
  }
});

test('no two cache rules claim the same path', () => {
  /* The rules are written not to overlap, so nothing depends on which one wins. */
  const cacheRules = rules.filter((rule) => rule.headers.some((h) => h.key === 'Cache-Control'));

  const paths = [
    '/',
    '/index.html',
    '/sw.js',
    '/precache-manifest.js',
    '/manifest.webmanifest',
    '/src/js/main.js',
    '/src/css/base.css',
    '/icons/icon-192.png'
  ];

  for (const path of paths) {
    const matched = cacheRules.filter((rule) => rule.matches(path)).map((rule) => rule.source);
    assert.equal(matched.length, 1, path + ' is claimed by ' + matched.length + ': ' + matched.join(', '));
  }
});

/* --------------------------------------------------------------------- CSP */

test('the CSP reaches every path, not just the page', () => {
  for (const path of ['/', '/index.html', '/sw.js', '/src/js/main.js', '/icons/icon.svg']) {
    assert.ok(headers(path)['Content-Security-Policy'], path + ' has no CSP');
  }
});

test('nothing anywhere in the policy allows eval', () => {
  const whole = headers('/')['Content-Security-Policy'];

  assert.doesNotMatch(whole, /unsafe-eval/);
  assert.doesNotMatch(whole, /wasm-unsafe-eval/);
});

test('script-src allows no inline script', () => {
  /* The one classic script in the head is a file for exactly this reason. */
  assert.ok(!csp['script-src'].includes("'unsafe-inline'"));
  assert.deepEqual(csp['script-src'], ["'self'", 'https://cdn.jsdelivr.net']);
});

test("style-src carries 'unsafe-inline' and says so deliberately", () => {
  /* Leaflet positions every pane, tile and popup through element.style. There is no way to
     run it without this short of rewriting the library. */
  assert.ok(csp['style-src'].includes("'unsafe-inline'"));
});

test('the page cannot be framed', () => {
  assert.deepEqual(csp['frame-ancestors'], ["'none'"]);
});

test('plugins and base tag injection are shut off', () => {
  assert.deepEqual(csp['object-src'], ["'none'"]);
  assert.deepEqual(csp['base-uri'], ["'self'"]);
  assert.deepEqual(csp['form-action'], ["'self'"]);
});

test('default-src is self, so an undeclared directive falls back to nothing external', () => {
  assert.deepEqual(csp['default-src'], ["'self'"]);
});

test('every external host the app actually uses is allowed', () => {
  const needed = [
    { directive: 'connect-src', host: 'https://nominatim.openstreetmap.org', why: 'place search' },
    { directive: 'img-src', host: 'https://*.basemaps.cartocdn.com', why: 'CARTO tiles' },
    { directive: 'img-src', host: 'https://*.tile.openstreetmap.org', why: 'OSM tiles' },
    { directive: 'connect-src', host: 'https://*.basemaps.cartocdn.com', why: 'the worker caching CARTO tiles' },
    { directive: 'connect-src', host: 'https://*.tile.openstreetmap.org', why: 'the worker caching OSM tiles' },
    { directive: 'connect-src', host: 'https://cdn.jsdelivr.net', why: 'the worker precaching Leaflet' },
    { directive: 'script-src', host: 'https://cdn.jsdelivr.net', why: 'Leaflet and markercluster' },
    { directive: 'style-src', host: 'https://cdn.jsdelivr.net', why: 'their stylesheets' }
  ];

  for (const entry of needed) {
    assert.ok(
      csp[entry.directive].includes(entry.host),
      entry.directive + ' is missing ' + entry.host + ' (' + entry.why + ')'
    );
  }
});

test('photos and the worker can do what they need', () => {
  /* blob: for the object URLs every photo surface uses; worker-src for registering sw.js. */
  assert.ok(csp['img-src'].includes('blob:'));
  assert.deepEqual(csp['worker-src'], ["'self'"]);
  assert.deepEqual(csp['manifest-src'], ["'self'"]);
});

test('the CDN urls the worker precaches fall under script-src or style-src', () => {
  /* The precache list and the policy are written in different files; this is what stops them
     drifting into a worker that cannot fetch what it is told to cache. */
  const manifest = {};
  // eslint-disable-next-line no-new-func
  new Function('self', readFileSync(join(root, 'precache-manifest.js'), 'utf8'))(manifest);

  const allowed = new Set([...csp['script-src'], ...csp['style-src'], ...csp['connect-src']]);

  for (const url of manifest.PRECACHE_REMOTE) {
    const origin = new URL(url).origin;
    assert.ok(allowed.has(origin), url + ' is precached but ' + origin + ' is not in the policy');
  }
});

test('no external host is allowed that the app does not use', () => {
  const known = new Set([
    "'self'",
    "'none'",
    "'unsafe-inline'",
    'data:',
    'blob:',
    'https://cdn.jsdelivr.net',
    'https://nominatim.openstreetmap.org',
    'https://*.tile.openstreetmap.org',
    'https://tile.openstreetmap.org',
    'https://*.basemaps.cartocdn.com'
  ]);

  for (const [directive, sources] of Object.entries(csp)) {
    for (const source of sources) {
      assert.ok(known.has(source), directive + ' allows an unexpected source: ' + source);
    }
  }
});

/* ------------------------------------------------------- the other headers */

test('content type sniffing is off', () => {
  assert.equal(headers('/index.html')['X-Content-Type-Options'], 'nosniff');
});

test('the referrer policy still sends an origin, which the tile terms require', () => {
  /* OpenStreetMap's tile usage policy asks for an identifiable referer. no-referrer would
     satisfy privacy and break the terms we are using the tiles under. */
  const policy = headers('/index.html')['Referrer-Policy'];

  assert.equal(policy, 'strict-origin-when-cross-origin');
  assert.notEqual(policy, 'no-referrer');
});

test('camera, microphone and location are denied to the page', () => {
  /* A file input is not gated by the camera permission, so the picker still offers the camera
     on a phone. Nothing in the app asks for the other two. */
  const policy = headers('/index.html')['Permissions-Policy'];

  assert.match(policy, /camera=\(\)/);
  assert.match(policy, /microphone=\(\)/);
  assert.match(policy, /geolocation=\(\)/);
});

/* -------------------------------------------------------- the source matcher */

test('a source pattern that is not understood throws rather than being guessed at', () => {
  /* Treating it as a literal would drop a header in testing that production applies. */
  assert.throws(() => compileSource('/:path*'), /does not understand/);
  assert.throws(() => compileSource('/api/(foo|bar)'), /does not understand/);
});

test('every source in vercel.json is one the server understands', () => {
  for (const rule of config.headers) {
    assert.doesNotThrow(() => compileSource(rule.source), rule.source);
  }
});

test('a prefix source matches below it and nothing beside it', () => {
  const matches = compileSource('/icons/(.*)');

  assert.equal(matches('/icons/icon.svg'), true);
  assert.equal(matches('/icons/nested/x.png'), true);
  assert.equal(matches('/iconsmith.svg'), false);
  assert.equal(matches('/src/icons/x.png'), false);
});
