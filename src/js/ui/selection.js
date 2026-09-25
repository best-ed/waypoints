/* Matches the memory store: a broken listener stays visible in the console without
   unwinding a selection change that has already happened. */
function rethrowAsync(error) {
  queueMicrotask(() => {
    throw error;
  });
}

/* Holds only an id. The list and the map both read from here and neither knows about the
   other, which is what keeps them from calling into each other in a loop. */
export function createSelection({ onListenerError = rethrowAsync } = {}) {
  let selectedId = null;
  const listeners = new Set();

  function notify() {
    for (const listener of [...listeners]) {
      try {
        listener(selectedId);
      } catch (error) {
        onListenerError(error);
      }
    }
  }

  function select(id) {
    /* Re-selecting what is already selected is silent, so a popup opening in response to
       a list click cannot bounce the selection back round again. */
    if (id === selectedId) {
      return;
    }
    selectedId = id;
    notify();
  }

  function clear() {
    if (selectedId === null) {
      return;
    }
    selectedId = null;
    notify();
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
    select,
    clear,
    subscribe,
    getSelected: () => selectedId,
    isSelected: (id) => id !== null && id === selectedId
  };
}
