import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isSandbox, storageNamesFor, buildSearch, SANDBOX_PARAM } from '../../src/js/dev/sandbox.js';
import { buildDevApi, isDevHost } from '../../src/js/dev/dev-api.js';
import { STORAGE_KEY, CORRUPT_KEY_PREFIX } from '../../src/js/data/schema.js';
import { SETTINGS_KEY } from '../../src/js/data/settings-store.js';
import { DATABASE_NAME } from '../../src/js/photos/indexeddb-backend.js';

test('a bare sandbox flag turns it on', () => {
  assert.equal(isSandbox('?sandbox'), true);
  assert.equal(isSandbox('sandbox'), true);
  assert.equal(isSandbox('?sandbox='), true);
  assert.equal(isSandbox('?sandbox=1'), true);
});

test('it stays on alongside filter parameters', () => {
  assert.equal(isSandbox('?sandbox&q=sunset&tags=trail'), true);
  assert.equal(isSandbox('?q=sunset&sandbox'), true);
});

test('it is off without the flag', () => {
  for (const search of ['', '?', null, undefined, '?q=sunset', '?sandboxed=1', '?nosandbox']) {
    assert.equal(isSandbox(search), false, JSON.stringify(search));
  }
});

/* The whole isolation guarantee rests on these never overlapping. */
test('sandbox names share nothing with the real ones', () => {
  const real = storageNamesFor(false);
  const box = storageNamesFor(true);

  assert.notEqual(real.storageKey, box.storageKey);
  assert.notEqual(real.corruptKeyPrefix, box.corruptKeyPrefix);
  assert.notEqual(real.databaseName, box.databaseName);
  assert.notEqual(real.settingsKey, box.settingsKey);
});

test('the real names are the ones the rest of the app uses', () => {
  assert.deepEqual(storageNamesFor(false), {
    storageKey: STORAGE_KEY,
    corruptKeyPrefix: CORRUPT_KEY_PREFIX,
    databaseName: DATABASE_NAME,
    settingsKey: SETTINGS_KEY
  });
});

test('the sandbox names are the agreed ones', () => {
  assert.deepEqual(storageNamesFor(true), {
    storageKey: 'waypoints:sandbox:v1',
    corruptKeyPrefix: 'waypoints:sandbox:v1:corrupt-',
    databaseName: 'waypoints-sandbox',
    settingsKey: 'waypoints:sandbox:settings'
  });
});

/* A corrupt sandbox envelope must not be backed up under a key the real app would later
   read as one of its own backups. */
test('the sandbox corrupt prefix is not a prefix of the real one, or the reverse', () => {
  const real = storageNamesFor(false);
  const box = storageNamesFor(true);

  assert.ok(!box.corruptKeyPrefix.startsWith(real.corruptKeyPrefix));
  assert.ok(!real.corruptKeyPrefix.startsWith(box.corruptKeyPrefix));
});

test('an unfiltered sandbox session keeps just the flag', () => {
  assert.equal(buildSearch('', true), '?' + SANDBOX_PARAM);
});

test('the flag survives a filter change', () => {
  assert.equal(buildSearch('q=sunset&tags=trail', true), '?sandbox&q=sunset&tags=trail');
});

test('a round trip through the search keeps sandbox on', () => {
  assert.equal(isSandbox(buildSearch('q=sunset', true)), true);
  assert.equal(isSandbox(buildSearch('', true)), true);
});

test('nothing is added outside sandbox mode', () => {
  assert.equal(buildSearch('q=sunset', false), '?q=sunset');
  assert.equal(buildSearch('', false), '');
});

test('development hosts are recognised', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]', '::1']) {
    assert.equal(isDevHost(host), true, host);
  }
});

test('anything else is not a development host', () => {
  for (const host of ['waypoints.example.com', '192.168.1.8', 'localhost.evil.com', '', undefined]) {
    assert.equal(isDevHost(host), false, String(host));
  }
});

/* The guard. seed() can write a thousand records over whatever is in storage, so it has to be
   unreachable unless both conditions hold. */
test('no console api at all off a development host', () => {
  const store = { list: () => [] };

  assert.equal(buildDevApi(store, { sandbox: true, devHost: false, seed: () => {} }), null);
  assert.equal(buildDevApi(store, { sandbox: false, devHost: false }), null);
  assert.equal(buildDevApi(store, {}), null);
});

test('a development host without sandbox gets the store and nothing else', () => {
  const store = { list: () => [], add: () => {} };
  const api = buildDevApi(store, { sandbox: false, devHost: true, seed: () => {}, clearSandbox: () => {} });

  assert.equal(api, store, 'the store itself, not a copy with extras');
  assert.equal(api.seed, undefined, 'seed is not reachable');
  assert.equal(api.clearSandbox, undefined, 'clearSandbox is not reachable');
});

test('seed appears only on a development host in sandbox mode', () => {
  const store = { list: () => [] };
  const seed = () => 'seeded';
  const clearSandbox = () => 'cleared';
  const api = buildDevApi(store, { sandbox: true, devHost: true, seed, clearSandbox });

  assert.equal(api.seed, seed);
  assert.equal(api.clearSandbox, clearSandbox);
});

test('the store methods are still there in sandbox mode', () => {
  const store = { list: () => ['a'], add: () => 'added', subscribe: () => () => {} };
  const api = buildDevApi(store, { sandbox: true, devHost: true, seed: () => {}, clearSandbox: () => {} });

  assert.deepEqual(api.list(), ['a']);
  assert.equal(api.add(), 'added');
  assert.equal(typeof api.subscribe, 'function');
});

test('the exposed object does not leak seed back onto the store', () => {
  const store = { list: () => [] };
  buildDevApi(store, { sandbox: true, devHost: true, seed: () => {}, clearSandbox: () => {} });

  assert.equal(store.seed, undefined, 'the store itself is left alone');
});
