/* Minimal stand-in for the Web Storage API. failOnSet makes the next writes throw so
   quota handling can be exercised without filling a real browser store. */
export function createFakeStorage(initial = {}) {
  const entries = new Map(Object.entries(initial));
  let failure = null;

  return {
    entries,

    getItem(key) {
      return entries.has(key) ? entries.get(key) : null;
    },

    setItem(key, value) {
      if (failure) {
        throw failure;
      }
      entries.set(key, String(value));
    },

    removeItem(key) {
      entries.delete(key);
    },

    keys() {
      return [...entries.keys()];
    },

    failOnSet(error) {
      failure = error;
    },

    allowSet() {
      failure = null;
    }
  };
}

export function quotaExceededError() {
  const error = new Error('quota exceeded');
  error.name = 'QuotaExceededError';
  error.code = 22;
  return error;
}

export function fixedNow(iso = '2025-05-01T10:00:00.000Z') {
  return () => new Date(iso);
}

/* Each call advances by a second so createdAt and updatedAt are distinguishable. */
export function tickingNow(startIso = '2025-05-01T10:00:00.000Z', stepMs = 1000) {
  let current = new Date(startIso).getTime();
  return () => {
    const value = new Date(current);
    current += stepMs;
    return value;
  };
}
