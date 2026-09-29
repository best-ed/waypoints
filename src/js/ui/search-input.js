const DEBOUNCE_MS = 150;

/* Debounced so typing does not re-render the list and every marker on each keystroke.
   The clear button and Esc bypass the delay - those are deliberate, finished actions. */
export function createSearchInput({ inputElement, clearElement, onQueryChange, debounceMs = DEBOUNCE_MS }) {
  let timer = null;

  function cancelPending() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function syncClearButton() {
    clearElement.hidden = inputElement.value === '';
  }

  function commit(query) {
    cancelPending();
    syncClearButton();
    onQueryChange(query);
  }

  function clear({ focus = true } = {}) {
    inputElement.value = '';
    commit('');
    if (focus) {
      inputElement.focus();
    }
  }

  inputElement.addEventListener('input', () => {
    syncClearButton();
    cancelPending();
    timer = setTimeout(() => {
      timer = null;
      onQueryChange(inputElement.value);
    }, debounceMs);
  });

  clearElement.addEventListener('click', () => clear());

  syncClearButton();

  return {
    clear,
    focus: () => inputElement.focus(),
    getValue: () => inputElement.value,
    isFocused: () => document.activeElement === inputElement
  };
}
