import { parseTagInput, todayLocalDate } from './form-values.js';

const SAVED = 'saved';
const CANCELLED = 'cancelled';

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

  let coordinates = null;
  let returnFocusTo = null;
  let closeReason = CANCELLED;

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
    isOpen: () => dialog.open
  };
}
