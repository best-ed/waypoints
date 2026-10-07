import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveBasemapId,
  readBasemapId,
  writeBasemapId
} from '../../src/js/map/basemap-preference.js';
import { BASEMAPS, BASEMAP_STORAGE_KEY, DEFAULT_BASEMAP_ID } from '../../src/js/config.js';

function fakeStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    values
  };
}

function throwingStorage() {
  return {
    getItem() {
      throw new DOMException('denied', 'SecurityError');
    },
    setItem() {
      throw new DOMException('denied', 'SecurityError');
    }
  };
}

test('the default is one of the basemaps on offer', () => {
  assert.ok(Object.hasOwn(BASEMAPS, DEFAULT_BASEMAP_ID));
});

test('the default is a basemap that actually exists', () => {
  /* Named by id rather than asserted to be a particular provider: which one ships is a
     deployment decision, but a default pointing at nothing is a blank map. */
  assert.ok(
    Object.prototype.hasOwnProperty.call(BASEMAPS, DEFAULT_BASEMAP_ID),
    DEFAULT_BASEMAP_ID + ' is not one of ' + Object.keys(BASEMAPS).join(', ')
  );
});

test('no basemap needs an API key we do not have', () => {
  /* CARTO started requiring one and every tile came back as a watermark. Nothing ships with a
     key placeholder or an empty key in its url. */
  for (const [id, basemap] of Object.entries(BASEMAPS)) {
    assert.doesNotMatch(basemap.url, /api[_-]?key|access[_-]?token/i, id);
    assert.doesNotMatch(basemap.darkUrl ?? '', /api[_-]?key|access[_-]?token/i, id);
  }
});

test('every basemap carries a url, a label and an attribution', () => {
  for (const [id, basemap] of Object.entries(BASEMAPS)) {
    assert.equal(typeof basemap.url, 'string', id);
    assert.equal(typeof basemap.label, 'string', id);
    assert.ok(basemap.attribution.length > 0, id + ' must credit its source');
    assert.ok(basemap.url.startsWith('https://'), id + ' must be https');
  }
});

test('a known id is kept', () => {
  for (const id of Object.keys(BASEMAPS)) {
    assert.equal(resolveBasemapId(id), id);
  }
});

/* The stored value is as editable as anything else in localStorage, and a basemap that has
   since been removed would otherwise leave the map with no tiles at all. */
test('an unknown or malformed id falls back to the default', () => {
  for (const value of ['satellite-pro', '', 'VOYAGER', null, undefined, 42, {}, []]) {
    assert.equal(resolveBasemapId(value), DEFAULT_BASEMAP_ID, JSON.stringify(value));
  }
});

test('an inherited property name is not mistaken for a basemap', () => {
  for (const value of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
    assert.equal(resolveBasemapId(value), DEFAULT_BASEMAP_ID, value);
  }
});

test('reads a stored choice', () => {
  const storage = fakeStorage({ [BASEMAP_STORAGE_KEY]: 'osm' });
  assert.equal(readBasemapId(storage), 'osm');
});

test('an empty store gives the default', () => {
  assert.equal(readBasemapId(fakeStorage()), DEFAULT_BASEMAP_ID);
});

test('a junk stored value gives the default', () => {
  assert.equal(readBasemapId(fakeStorage({ [BASEMAP_STORAGE_KEY]: 'nope' })), DEFAULT_BASEMAP_ID);
});

test('writes under its own key and nothing else', () => {
  const storage = fakeStorage();
  writeBasemapId(storage, 'osm');

  assert.equal(storage.getItem(BASEMAP_STORAGE_KEY), 'osm');
  assert.deepEqual([...storage.values.keys()], [BASEMAP_STORAGE_KEY]);
});

/* A display preference must not travel with the memories, or it would end up in an export. */
test('the key is not inside the memories envelope', () => {
  assert.notEqual(BASEMAP_STORAGE_KEY, 'waypoints:v1');
  assert.ok(!BASEMAP_STORAGE_KEY.startsWith('waypoints:v1'));
});

test('a junk id is not written through', () => {
  const storage = fakeStorage();
  writeBasemapId(storage, 'satellite-pro');

  assert.equal(storage.getItem(BASEMAP_STORAGE_KEY), DEFAULT_BASEMAP_ID);
});

test('a round trip keeps the choice', () => {
  const storage = fakeStorage();

  for (const id of Object.keys(BASEMAPS)) {
    writeBasemapId(storage, id);
    assert.equal(readBasemapId(storage), id);
  }
});

/* localStorage throws outright, rather than returning null, when site data is blocked. A
   missing preference must never stop the map from starting. */
test('blocked storage still yields a usable basemap', () => {
  assert.equal(readBasemapId(throwingStorage()), DEFAULT_BASEMAP_ID);
});

test('a write to blocked storage reports failure rather than throwing', () => {
  assert.equal(writeBasemapId(throwingStorage(), 'osm'), false);
});

test('a successful write reports success', () => {
  assert.equal(writeBasemapId(fakeStorage(), 'osm'), true);
});
