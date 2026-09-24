import { parseTagInput, todayLocalDate } from './form-values.js';

const SAVED = 'saved';
const CANCELLED = 'cancelled';

const FIELDS = [
  { name: 'title', inputId: 'memory-title', errorId: 'memory-title-error' },
  { name: 'date', inputId: 'memory-date', errorId: 'memory-date-error' },
  { name: 'note', inputId: 'memory-note', errorId: 'memory-note-error' },
  { name: 'placeName', inputId: 'memory-place-name', errorId: 'memory-place-name-error' },
  { name: 'tags', inputId: 'memory-tags', errorId: 'memory-tags-error', hintId: 'memory-tags-hint' }
];

function formatCoordinates({ lat, lng }) {
  return lat.toFixed(6) + ', ' + lng.toFixed(6);
}

/* A click lands on the dialog element itself for both the backdrop and the dialog's own
   padding, so the pointer position decides which one it was. */
function isBackdropClick(event, dialog) {
  if (event.target !== dialog) {
    return false;
  }
  const rect = dialog.getBoundingClientRect();
  return (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  );
}

export function createMemoryForm({ document: doc = document, onSubmit, onCancel, now = () => new Date() }) {
  const dialog = doc.getElementById('memory-dialog');
  const form = doc.getElementById('memory-form');
  const coordinatesOutput = doc.getElementById('memory-coordinates');
  const cancelButton = doc.getElementById('memory-cancel');
  const titleInput = doc.getElementById('memory-title');
  const formError = doc.getElementById('memory-form-error');

  let coordinates = null;
  let returnFocusTo = null;
  let closeReason = CANCELLED;

  const fields = FIELDS.map((field) => ({
    ...field,
    input: doc.getElementById(field.inputId),
    error: doc.getElementById(field.errorId)
  }));

  function describedBy(field, hasError) {
    return [field.hintId, hasError ? field.errorId : null].filter(Boolean).join(' ');
  }

  function applyFieldError(field, message) {
    const hasError = Boolean(message);

    field.error.textContent = message ?? '';
    field.error.hidden = !hasError;
    field.input.setAttribute('aria-invalid', String(hasError));

    const describedByValue = describedBy(field, hasError);
    if (describedByValue) {
      field.input.setAttribute('aria-describedby', describedByValue);
    } else {
      field.input.removeAttribute('aria-describedby');
    }
  }

  function showFormError(message) {
    formError.textContent = message;
    formError.hidden = false;
  }

  function clearFormError() {
    formError.textContent = '';
    formError.hidden = true;
  }

  function clearErrors() {
    clearFormError();
    for (const field of fields) {
      applyFieldError(field, null);
    }
  }

  /* Returns the error keys with no field of their own - lat and lng are read-only text,
     so anything reported against them has to surface at form level instead. */
  function showFieldErrors(errors = {}) {
    clearFormError();
    const shown = new Set();

    for (const field of fields) {
      const message = errors[field.name];
      applyFieldError(field, message ?? null);
      if (message) {
        shown.add(field.name);
      }
    }

    const firstInvalid = fields.find((field) => errors[field.name]);
    if (firstInvalid) {
      firstInvalid.input.focus();
    }

    return Object.keys(errors).filter((key) => !shown.has(key));
  }

  function readValues() {
    const data = new FormData(form);
    return {
      title: data.get('title'),
      date: data.get('date'),
      note: data.get('note'),
      placeName: data.get('placeName'),
      tags: parseTagInput(data.get('tags')),
      lat: coordinates.lat,
      lng: coordinates.lng
    };
  }

  function open(nextCoordinates, { returnFocus = null } = {}) {
    coordinates = nextCoordinates;
    returnFocusTo = returnFocus;
    closeReason = CANCELLED;

    form.reset();
    clearErrors();
    coordinatesOutput.textContent = formatCoordinates(nextCoordinates);
    form.elements.date.value = todayLocalDate(now());

    dialog.showModal();
    titleInput.focus();
  }

  function close(reason = CANCELLED) {
    closeReason = reason;
    dialog.close();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    onSubmit(readValues());
  });

  cancelButton.addEventListener('click', () => close(CANCELLED));

  dialog.addEventListener('click', (event) => {
    if (isBackdropClick(event, dialog)) {
      close(CANCELLED);
    }
  });

  /* Fires for the close button, Esc, the backdrop and a successful save alike, so the
     draft marker is cleaned up on every path out of the dialog. */
  dialog.addEventListener('close', () => {
    if (closeReason !== SAVED) {
      onCancel();
    }
    if (returnFocusTo) {
      returnFocusTo.focus();
    }
  });

  return {
    open,
    close: () => close(CANCELLED),
    closeAsSaved: () => close(SAVED),
    showFieldErrors,
    showFormError,
    clearErrors,
    isOpen: () => dialog.open
  };
}
