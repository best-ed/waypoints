import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';

import {
  buildPrecache,
  NOT_SHIPPED,
  PRECACHE_FILE,
  renderPrecache
} from '../../scripts/precache.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const committed = readFileSync(join(root, PRECACHE_FILE), 'utf8');
const precache = buildPrecache(root);

test('the committed precache manifest is exactly what the files on disk produce', () => {
  /* The whole point of the file. If this fails, a shipped file changed and nobody ran
     npm run precache, so the worker would serve a cache that does not match the source. */
  assert.equal(
    committed,
    renderPrecache(precache),
    'precache-manifest.js is stale - run npm run precache'
  );
});

test('every hash in the committed manifest is the real hash of that file', () => {
  for (const entry of precache.entries) {
    const actual = createHash('sha256').update(readFileSync(join(root, entry.url))).digest('hex');

    assert.equal(entry.hash, actual, entry.url + ' is listed with the wrong hash');
    assert.ok(committed.includes(actual), entry.url + ' hash is not in the committed file');
  }
});

/* Walked independently of the generator. If both used the same walk this would only prove the
   generator agrees with itself. */
function walkIndependently(dir, test, found = []) {
  for (const name of readdirSync(join(root, dir))) {
    const path = join(root, dir, name);

    if (statSync(path).isDirectory()) {
      walkIndependently(join(dir, name), test, found);
    } else if (test(name)) {
      found.push(relative(root, path).split(sep).join('/'));
    }
  }

  return found;
}

test('no shipped file is missing from the manifest', () => {
  const listed = new Set(precache.entries.map((entry) => entry.url));

  const shipped = [
    'index.html',
    'manifest.webmanifest',
    ...walkIndependently('src/css', (name) => name.endsWith('.css')),
    ...walkIndependently('src/js', (name) => name.endsWith('.js')),
    ...walkIndependently('icons', (name) => name.endsWith('.png') || name.endsWith('.svg'))
  ];

  const missing = shipped.filter((file) => !listed.has(file));

  assert.deepEqual(missing, [], 'these ship but are not precached: ' + missing.join(', '));
});

test('every module index.html loads is in the manifest', () => {
  /* The entry point in particular: a precache that misses main.js boots to a blank page. */
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const local = [...html.matchAll(/(?:src|href)="(src\/[^"]+|icons\/[^"]+|manifest\.webmanifest)"/g)].map(
    (match) => match[1]
  );
  const listed = new Set(precache.entries.map((entry) => entry.url));

  assert.ok(local.length > 0, 'nothing local was found in index.html, so this proves nothing');

  for (const reference of local) {
    assert.ok(listed.has(reference), reference + ' is loaded by index.html but not precached');
  }
});

test('every module imported from another module is in the manifest', () => {
  /* A module graph reachable from main.js but missing one leaf would boot online and fail
     offline on exactly one route. Resolved relatively, the way the browser does it. */
  const listed = new Set(precache.entries.map((entry) => entry.url));
  const missing = [];

  for (const entry of precache.entries) {
    if (!entry.url.endsWith('.js')) continue;

    const source = readFileSync(join(root, entry.url), 'utf8');
    const imports = [...source.matchAll(/from\s+'(\.[^']+)'/g)].map((match) => match[1]);
    const dir = entry.url.slice(0, entry.url.lastIndexOf('/'));

    for (const specifier of imports) {
      const resolved = join(dir, specifier).split(sep).join('/');
      if (!listed.has(resolved)) missing.push(entry.url + ' -> ' + specifier);
    }
  }

  assert.deepEqual(missing, [], 'imported but not precached: ' + missing.join(', '));
});

test('the worker and the manifest itself are not precached', () => {
  const listed = new Set(precache.entries.map((entry) => entry.url));

  for (const file of NOT_SHIPPED) {
    assert.ok(!listed.has(file), file + ' must not be precached by the worker it belongs to');
  }
});

test('the CDN urls are exactly the ones index.html pins', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const inHtml = [...new Set(html.match(/https:\/\/cdn\.jsdelivr\.net\/[^"']+/g) ?? [])].sort();

  assert.deepEqual(precache.remote, inHtml);
  assert.equal(precache.remote.length, 4, 'leaflet and markercluster, a script and a sheet each');
});

test('nothing that is not shipped found its way in', () => {
  const forbidden = ['tests/', 'scripts/', 'docs/', 'node_modules/', 'package.json', '.githooks/'];

  for (const entry of precache.entries) {
    for (const prefix of forbidden) {
      assert.ok(!entry.url.startsWith(prefix), entry.url + ' is not something the browser loads');
    }
  }
});

test('the version is the hash of the whole list, so any change moves it', () => {
  assert.match(precache.version, /^[0-9a-f]{12}$/);
  assert.ok(committed.includes('self.PRECACHE_VERSION = "' + precache.version + '"'));

  /* Changing one byte of one listed file has to produce a different version. Proved by
     hashing the same list with one hash altered rather than by writing to the repo. */
  const altered = [...precache.entries.map((e) => e.url + ':' + e.hash), ...precache.remote.map((u) => u + ':null')];
  altered[0] = altered[0].slice(0, -1) + (altered[0].endsWith('a') ? 'b' : 'a');

  const shifted = createHash('sha256').update(altered.join('\n')).digest('hex').slice(0, 12);

  assert.notEqual(shifted, precache.version);
});

test('the generated file is a classic script the worker can importScripts', () => {
  /* It has to assign onto self and use no module syntax: a service worker reads it with
     importScripts, which cannot load a module. */
  assert.match(committed, /^self\.PRECACHE_VERSION =/m);
  assert.match(committed, /^self\.PRECACHE_FILES = \[/m);
  assert.match(committed, /^self\.PRECACHE_REMOTE = \[/m);
  assert.doesNotMatch(committed, /^(import|export)\s/m);
});
