import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createSettingsStore,
  resolveSettings,
  parseSettings,
  DEFAULT_SETTINGS,
  SETTINGS_KEY
} from '../../src/js/data/settings-store.js';
import { STORAGE_KEY } from '../../src/js/data/schema.js';

function fakeStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    values
  };
}

function blockedStorage() {
  return {
    getItem() {
      throw new DOMException('denied', 'SecurityError');
    },
    setItem() {
      throw new DOMException('denied', 'SecurityError');
    }
  };
}

function setup(initial = {}) {
  const storage = fakeStorage(initial);
  return { storage, settings: createSettingsStore({ storage }) };
}

function storedSettings(storage) {
  const raw = storage.getItem(SETTINGS_KEY);
  return raw === null ? null : JSON.parse(raw);
}

test('place name suggestions are on by default', () => {
  assert.equal(DEFAULT_SETTINGS.suggestPlaceNames, true);
  /* On by default: a full brightness map inside a dark interface is the first thing anyone
     notices about dark mode here. */
  assert.equal(DEFAULT_SETTINGS.dimMapInDark, true);
});

test('an empty store starts at the defaults', () => {
  const { settings } = setup();
  assert.deepEqual(settings.get(), { suggestPlaceNames: true, theme: 'system', dimMapInDark: true });
});

test('reads a stored setting', () => {
  const { settings } = setup({ [SETTINGS_KEY]: JSON.stringify({ suggestPlaceNames: false }) });
  assert.equal(settings.get().suggestPlaceNames, false);
});

/* Same resilience as the basemap preference: a half-written or hand-edited value can only ever
   cost that one setting. */
test('junk in the key falls back to the defaults', () => {
  for (const raw of ['', 'not json', '[]', 'null', '42', '{', '{"suggestPlaceNames":"yes"}']) {
    const { settings } = setup({ [SETTINGS_KEY]: raw });
    assert.deepEqual(settings.get(), { suggestPlaceNames: true, theme: 'system', dimMapInDark: true }, JSON.stringify(raw));
  }
});

test('an unknown key in the stored value is ignored', () => {
  const { settings } = setup({
    [SETTINGS_KEY]: JSON.stringify({ suggestPlaceNames: false, somethingElse: 'x' })
  });

  assert.deepEqual(settings.get(), { suggestPlaceNames: false, theme: 'system', dimMapInDark: true });
});

test('a __proto__ key in the stored value pollutes nothing', () => {
  const { settings } = setup({ [SETTINGS_KEY]: '{"__proto__":{"polluted3":true}}' });

  settings.get();

  assert.equal({}.polluted3, undefined);
});

/* Every field has to appear by name in set(), and missing one fails silently: the patch is
   dropped, the result equals what was there, the equality check returns early and nothing is
   written or notified. dimMapInDark shipped that way for exactly as long as it took to write
   this. Looped over the fields so the next setting cannot repeat it. */
test('every setting round-trips through set and is written', () => {
  const cases = [
    ['suggestPlaceNames', false],
    ['theme', 'dark'],
    ['dimMapInDark', false]
  ];

  for (const [field, value] of cases) {
    const { settings, storage } = setup();
    const seen = [];
    settings.subscribe((next) => seen.push(next[field]));

    settings.set({ [field]: value });

    assert.equal(settings.get()[field], value, field + ' was not applied');
    assert.equal(storedSettings(storage)[field], value, field + ' was not written');
    assert.deepEqual(seen, [value], field + ' did not notify');
  }
});

test('a non-boolean dimMapInDark falls back rather than being coerced', () => {
  for (const value of ['false', 0, null, [], {}]) {
    assert.equal(resolveSettings({ dimMapInDark: value }).dimMapInDark, true, JSON.stringify(value));
  }

  assert.equal(resolveSettings({ dimMapInDark: false }).dimMapInDark, false);
});

test('resolveSettings fills every field with a typed fallback', () => {
  assert.deepEqual(resolveSettings(null), { suggestPlaceNames: true, theme: 'system', dimMapInDark: true });
  assert.deepEqual(resolveSettings([]), { suggestPlaceNames: true, theme: 'system', dimMapInDark: true });
  assert.deepEqual(resolveSettings('nope'), { suggestPlaceNames: true, theme: 'system', dimMapInDark: true });
  assert.deepEqual(resolveSettings({ suggestPlaceNames: 'false' }), { suggestPlaceNames: true, theme: 'system', dimMapInDark: true });
  assert.deepEqual(resolveSettings({ suggestPlaceNames: 0 }), { suggestPlaceNames: true, theme: 'system', dimMapInDark: true });
  assert.deepEqual(resolveSettings({ suggestPlaceNames: false }), { suggestPlaceNames: false, theme: 'system', dimMapInDark: true });
});

test('parseSettings copes with anything', () => {
  assert.deepEqual(parseSettings(undefined), { suggestPlaceNames: true, theme: 'system', dimMapInDark: true });
  assert.deepEqual(parseSettings('{"suggestPlaceNames":false}'), { suggestPlaceNames: false, theme: 'system', dimMapInDark: true });
  assert.deepEqual(parseSettings('{{{'), { suggestPlaceNames: true, theme: 'system', dimMapInDark: true });
});

test('a setting is written under its own key and nothing else', () => {
  const { storage, settings } = setup();

  settings.set({ suggestPlaceNames: false });

  assert.deepEqual(storedSettings(storage), { suggestPlaceNames: false, theme: 'system', dimMapInDark: true });
  assert.deepEqual([...storage.values.keys()], [SETTINGS_KEY]);
});

/* Settings are not user data: they must not travel with an export or go down with a corrupt
   memories envelope. */
test('the key is outside the memories envelope', () => {
  assert.notEqual(SETTINGS_KEY, STORAGE_KEY);
  assert.ok(!SETTINGS_KEY.startsWith(STORAGE_KEY));
});

test('a set is readable straight back', () => {
  const { settings } = setup();

  settings.set({ suggestPlaceNames: false });
  assert.equal(settings.get().suggestPlaceNames, false);

  settings.set({ suggestPlaceNames: true });
  assert.equal(settings.get().suggestPlaceNames, true);
});

test('a set survives a new store over the same storage', () => {
  const { storage, settings } = setup();
  settings.set({ suggestPlaceNames: false });

  assert.equal(createSettingsStore({ storage }).get().suggestPlaceNames, false);
});

/* set({}) must leave everything alone rather than resetting to the defaults. */
test('an empty patch changes nothing', () => {
  const { settings } = setup();
  settings.set({ suggestPlaceNames: false });

  settings.set({});

  assert.equal(settings.get().suggestPlaceNames, false);
});

test('a patch of the wrong shape changes nothing', () => {
  const { settings } = setup();
  settings.set({ suggestPlaceNames: false });

  for (const patch of [null, undefined, 'nope', 42, []]) {
    settings.set(patch);
    assert.equal(settings.get().suggestPlaceNames, false, JSON.stringify(patch));
  }
});

test('a value of the wrong type leaves the setting as it was', () => {
  const { settings } = setup();
  settings.set({ suggestPlaceNames: false });

  settings.set({ suggestPlaceNames: 'true' });

  assert.equal(settings.get().suggestPlaceNames, false);
});

test('get hands out a copy, not the live object', () => {
  const { settings } = setup();

  settings.get().suggestPlaceNames = false;

  assert.equal(settings.get().suggestPlaceNames, true);
});

test('subscribers hear a change', () => {
  const { settings } = setup();
  const seen = [];
  settings.subscribe((value) => seen.push(value.suggestPlaceNames));

  settings.set({ suggestPlaceNames: false });

  assert.deepEqual(seen, [false]);
});

test('setting the same value notifies nobody', () => {
  const { settings } = setup();
  let notices = 0;
  settings.subscribe(() => {
    notices += 1;
  });

  settings.set({ suggestPlaceNames: true });

  assert.equal(notices, 0);
});

test('unsubscribing stops the notifications', () => {
  const { settings } = setup();
  const seen = [];
  const unsubscribe = settings.subscribe((value) => seen.push(value.suggestPlaceNames));

  settings.set({ suggestPlaceNames: false });
  unsubscribe();
  settings.set({ suggestPlaceNames: true });

  assert.deepEqual(seen, [false]);
});

test('a throwing listener does not stop the others', () => {
  const storage = fakeStorage();
  const errors = [];
  const settings = createSettingsStore({ storage, onListenerError: (e) => errors.push(e.message) });
  const seen = [];

  settings.subscribe(() => {
    throw new Error('listener blew up');
  });
  settings.subscribe((value) => seen.push(value.suggestPlaceNames));

  settings.set({ suggestPlaceNames: false });

  assert.deepEqual(errors, ['listener blew up']);
  assert.deepEqual(seen, [false]);
});

// ------------------------------------------------------------------ blocked storage

test('blocked storage still yields usable settings', () => {
  const settings = createSettingsStore({ storage: blockedStorage() });

  assert.deepEqual(settings.get(), { suggestPlaceNames: true, theme: 'system', dimMapInDark: true });
});

/* The setting still applies for this session; only remembering it is lost. */
test('a setting applies even when it cannot be written', () => {
  const settings = createSettingsStore({ storage: blockedStorage() });
  const seen = [];
  settings.subscribe((value) => seen.push(value.suggestPlaceNames));

  settings.set({ suggestPlaceNames: false });

  assert.equal(settings.get().suggestPlaceNames, false);
  assert.deepEqual(seen, [false], 'listeners are still told');
});

test('a custom key is honoured, for the sandbox variant', () => {
  const storage = fakeStorage();
  const settings = createSettingsStore({ storage, key: 'waypoints:sandbox:settings' });

  settings.set({ suggestPlaceNames: false });

  assert.deepEqual([...storage.values.keys()], ['waypoints:sandbox:settings']);
  assert.equal(storage.getItem(SETTINGS_KEY), null, 'the real key was left alone');
});

// ------------------------------------------------------------------------- theme

test('the theme defaults to following the system', () => {
  assert.equal(DEFAULT_SETTINGS.theme, 'system');
  assert.equal(setup().settings.get().theme, 'system');
});

test('each theme value is accepted', () => {
  const { settings } = setup();

  for (const theme of ['light', 'dark', 'system']) {
    settings.set({ theme });
    assert.equal(settings.get().theme, theme);
  }
});

test('an unknown theme leaves the setting as it was', () => {
  const { settings } = setup();
  settings.set({ theme: 'dark' });

  for (const theme of ['midnight', '', null, 42, {}, 'DARK']) {
    settings.set({ theme });
    assert.equal(settings.get().theme, 'dark', JSON.stringify(theme));
  }
});

test('a junk stored theme falls back to system', () => {
  const { settings } = setup({ 'waypoints:settings': '{"theme":"midnight"}' });
  assert.equal(settings.get().theme, 'system');
});

test('the two settings are independent', () => {
  const { settings } = setup();

  settings.set({ theme: 'dark' });
  assert.equal(settings.get().suggestPlaceNames, true, 'the other setting survived');

  settings.set({ suggestPlaceNames: false });
  assert.equal(settings.get().theme, 'dark', 'the theme survived');
});
