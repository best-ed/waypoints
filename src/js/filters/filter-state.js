import { EMPTY_FILTERS, isFilterActive } from './apply-filters.js';

function rethrowAsync(error) {
  queueMicrotask(() => {
    throw error;
  });
}

/* Holds what is being filtered on, nothing about how it is applied. Day 8 adds setTags
   and setDateRange, which both go through the same update path and get change detection
   and notification for free. */
export function createFilterState({ onListenerError = rethrowAsync } = {}) {
  let filters = { ...EMPTY_FILTERS };
  const listeners = new Set();

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

  function getFilters() {
    return { ...filters };
  }

  /* Silent when nothing actually changed, so a debounced input that settles on the same
     text does not re-render the list and the map for no reason. */
  function update(patch) {
    const next = { ...filters, ...patch };
    const changed = Object.keys(next).some((key) => next[key] !== filters[key]);

    if (!changed) {
      return;
    }

    filters = next;
    notify();
  }

  function setQuery(query) {
    update({ query: typeof query === 'string' ? query : '' });
  }

  function clear() {
    update({ ...EMPTY_FILTERS });
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
    setQuery,
    clear,
    subscribe,
    isActive: () => isFilterActive(filters)
  };
}
