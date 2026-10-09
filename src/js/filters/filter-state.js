import { EMPTY_FILTERS, isFilterActive } from './apply-filters.js';

function rethrowAsync(error) {
  queueMicrotask(() => {
    throw error;
  });
}

function normalizeTags(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();
  for (const tag of value) {
    if (typeof tag === 'string' && tag.trim() !== '') {
      seen.add(tag.trim().toLowerCase());
    }
  }

  /* Sorted so two states holding the same tags compare equal whatever order they were
     selected in. */
  return [...seen].sort();
}

function sameTags(a, b) {
  return a.length === b.length && a.every((tag, index) => tag === b[index]);
}

function sameFilters(a, b) {
  return a.query === b.query && a.from === b.from && a.to === b.to && sameTags(a.tags, b.tags);
}

/* Holds what is being filtered on, nothing about how it is applied. */
export function createFilterState({ onListenerError = rethrowAsync } = {}) {
  let filters = { ...EMPTY_FILTERS, tags: [] };
  const listeners = new Set();

  function getFilters() {
    return { ...filters, tags: [...filters.tags] };
  }

  function notify() {
    const snapshot = getFilters();
    for (const listener of [...listeners]) {
      try {
        listener(snapshot);
      } catch (error) {
        onListenerError(error);
      }
    }
  }

  /* Silent when nothing actually changed, so a debounced input settling on the same text
     does not re-render the list and the map for no reason. */
  function update(patch) {
    const next = { ...filters, ...patch };
    next.tags = normalizeTags(next.tags);

    if (sameFilters(next, filters)) {
      return;
    }

    filters = next;
    notify();
  }

  function setQuery(query) {
    update({ query: typeof query === 'string' ? query : '' });
  }

  function setTags(tags) {
    update({ tags });
  }

  function toggleTag(tag) {
    const normalized = typeof tag === 'string' ? tag.trim().toLowerCase() : '';
    if (normalized === '') {
      return;
    }

    const next = filters.tags.includes(normalized)
      ? filters.tags.filter((existing) => existing !== normalized)
      : [...filters.tags, normalized];

    update({ tags: next });
  }

  function setDateRange({ from, to } = {}) {
    update({ from: from ?? null, to: to ?? null });
  }

  /* Called after the memories change. A tag nobody carries any more cannot be
     deselected through the UI, because its chip is gone, so it is dropped here. */
  function pruneTags(availableTags) {
    const available = new Set(normalizeTags(availableTags));
    update({ tags: filters.tags.filter((tag) => available.has(tag)) });
  }

  function clear() {
    update({ ...EMPTY_FILTERS, tags: [] });
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('subscribe expects a function');
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return {
    getFilters,
    /* Applies a partial change by name, which is what a removable chip carries. Everything
       goes through the same update(), so normalising, the no-change check and the
       notification are the same as for every other setter. */
    patch: (changes) => update(changes !== null && typeof changes === 'object' ? changes : {}),
    setQuery,
    setTags,
    toggleTag,
    setDateRange,
    pruneTags,
    clear,
    subscribe,
    hasTag: (tag) => filters.tags.includes(String(tag).toLowerCase()),
    isActive: () => isFilterActive(filters)
  };
}
