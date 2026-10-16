export const SETTINGS_KEY = 'waypoints:settings';

export const THEME_VALUES = Object.freeze(['system', 'light', 'dark']);

export const DEFAULT_SETTINGS = Object.freeze({
  /* On by default, because a place name is the thing most people want and the request is made
     only when a pin is placed. Turning it off stops the request being made at all. */
  suggestPlaceNames: true,

  /* "system" follows prefers-color-scheme. The other two override it. */
  theme: 'system',

  /* On by default. A full brightness map inside a dark interface is the thing people notice
     first about dark mode here, and it is unpleasant enough at night to be worth turning on
     for everyone. It is a setting rather than a decision because the filter is an
     approximation: it is the real map with its colours turned over, not a map drawn dark. */
  dimMapInDark: true
});

function asBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function asTheme(value, fallback) {
  return THEME_VALUES.includes(value) ? value : fallback;
}

/* Every field is read by name with a typed fallback, so a hand-edited or half-written value
   can only ever cost that one setting. Nothing is spread in from the parsed object. */
export function resolveSettings(raw) {
  const source = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};

  return {
    suggestPlaceNames: asBoolean(source.suggestPlaceNames, DEFAULT_SETTINGS.suggestPlaceNames),
    theme: asTheme(source.theme, DEFAULT_SETTINGS.theme),
    dimMapInDark: asBoolean(source.dimMapInDark, DEFAULT_SETTINGS.dimMapInDark)
  };
}

export function parseSettings(text) {
  if (typeof text !== 'string' || text === '') {
    return { ...DEFAULT_SETTINGS };
  }

  try {
    return resolveSettings(JSON.parse(text));
  } catch {
    /* Junk in the key is not worth an error message, and defaults are a working app. */
    return { ...DEFAULT_SETTINGS };
  }
}

/* Its own key, deliberately outside the memories envelope, for the same reasons as the basemap
   preference: settings are not user data, they should not travel with an export, and a corrupt
   memories envelope must not take them down with it. */
export function createSettingsStore({ storage, key = SETTINGS_KEY, onListenerError } = {}) {
  let current = read();
  const listeners = new Set();

  function read() {
    try {
      return parseSettings(storage.getItem(key));
    } catch {
      /* localStorage throws outright, rather than returning null, when site data is blocked. */
      return { ...DEFAULT_SETTINGS };
    }
  }

  function get() {
    return { ...current };
  }

  function report(error) {
    if (typeof onListenerError === 'function') {
      onListenerError(error);
      return;
    }
    queueMicrotask(() => {
      throw error;
    });
  }

  function notify() {
    const snapshot = get();
    for (const listener of [...listeners]) {
      try {
        listener(snapshot);
      } catch (error) {
        report(error);
      }
    }
  }

  /* A partial patch: each field falls back to what is already set rather than to the default,
     so set({}) leaves everything alone instead of resetting it. Built field by field, never
     spread from the argument.

     A preference that cannot be remembered is still applied for this session: the in-memory
     value changes and listeners are told, whether or not the write landed. */
  function set(changes) {
    const patch = changes !== null && typeof changes === 'object' && !Array.isArray(changes) ? changes : {};

    const next = resolveSettings({
      suggestPlaceNames: asBoolean(patch.suggestPlaceNames, current.suggestPlaceNames),
      theme: asTheme(patch.theme, current.theme),
      dimMapInDark: asBoolean(patch.dimMapInDark, current.dimMapInDark)
    });

    /* Compared as a whole, so a new setting needs no change here. Both sides come out of
       resolveSettings, so the key order is the same. */
    if (JSON.stringify(next) === JSON.stringify(current)) {
      return get();
    }

    current = next;

    try {
      storage.setItem(key, JSON.stringify(current));
    } catch {
      /* Blocked or full storage costs the persistence, not the setting. */
    }

    notify();
    return get();
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { get, set, subscribe };
}
