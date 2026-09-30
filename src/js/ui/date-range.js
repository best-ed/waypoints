/* The two inputs are one control: changing either reports the whole range, so the
   caller never has to merge a partial update. */
export function createDateRange({ container, fromElement, toElement, onChange }) {
  function read() {
    return {
      from: fromElement.value || null,
      to: toElement.value || null
    };
  }

  function render({ from, to }, { visible = true } = {}) {
    container.hidden = !visible;

    /* Only written when it differs, so a date being typed is not reset under the user
       by a render triggered elsewhere. */
    const nextFrom = from ?? '';
    const nextTo = to ?? '';

    if (fromElement.value !== nextFrom) {
      fromElement.value = nextFrom;
    }
    if (toElement.value !== nextTo) {
      toElement.value = nextTo;
    }

    /* Each input limits the other, so the native picker cannot build a backwards range. */
    fromElement.max = nextTo;
    toElement.min = nextFrom;
  }

  for (const input of [fromElement, toElement]) {
    input.addEventListener('change', () => onChange(read()));
  }

  return { render, read };
}
