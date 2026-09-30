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

  inputElement.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && inputElement.value !== '') {
      /* Stops Escape from also reaching anything else listening for it. */
      event.stopPropagation();
      clear();
    }
  });

  /* Focuses search from anywhere, unless the user is already typing somewhere or a
     modal is open, where "/" is just a character. */
  document.addEventListener('keydown', (event) => {
    if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    const target = event.target;
    const typing =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target && target.isContentEditable);

    if (typing || document.querySelector('dialog[open]')) {
      return;
    }

    event.preventDefault();
    inputElement.focus();
    inputElement.select();
  });

  syncClearButton();

  /* Used when filters arrive from the URL: the box has to show them without firing a
     change back at the state that just set them. */
  function setValue(value) {
    inputElement.value = value ?? '';
    cancelPending();
    syncClearButton();
  }

  return {
    clear,
    setValue,
    focus: () => inputElement.focus(),
    getValue: () => inputElement.value,
    isFocused: () => document.activeElement === inputElement
  };
}
