import { createObjectUrlPool } from './object-urls.js';

export function createLightbox({ document: doc = document }) {
  const dialog = doc.getElementById('lightbox');
  const image = doc.getElementById('lightbox-image');
  const position = doc.getElementById('lightbox-position');
  const previousButton = doc.getElementById('lightbox-previous');
  const nextButton = doc.getElementById('lightbox-next');
  const closeButton = doc.getElementById('lightbox-close');

  /* The pool covers the whole session rather than a single image, so stepping through
     ten photos and closing releases all ten in one place. */
  const urls = createObjectUrlPool();

  let records = [];
  let index = 0;
  let title = '';
  let returnFocusTo = null;

  function show() {
    const record = records[index];
    image.src = urls.create(record.blob);
    /* Set as a property, never as markup, so a title of <img ...> stays literal text. */
    image.alt = 'Photo ' + (index + 1) + ' of ' + title;

    position.textContent = index + 1 + ' of ' + records.length;

    const single = records.length < 2;
    previousButton.disabled = single;
    nextButton.disabled = single;
  }

  function step(offset) {
    if (records.length < 2) {
      return;
    }
    index = (index + offset + records.length) % records.length;
    show();
  }

  function open(nextRecords, startIndex, memory, returnFocus) {
    records = nextRecords;
    index = startIndex;
    title = memory.title;
    returnFocusTo = returnFocus;

    show();
    dialog.showModal();

    /* With one photo Previous and Next are disabled, so focusing Next would put focus
       nowhere. showModal happens to autofocus Close in that case, but only because it falls
       back to the first enabled control and because focus() on a disabled button silently
       does nothing - neither of which is a contract worth relying on. */
    (records.length < 2 ? closeButton : nextButton).focus();
  }

  previousButton.addEventListener('click', () => step(-1));
  nextButton.addEventListener('click', () => step(1));
  closeButton.addEventListener('click', () => dialog.close());

  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      step(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      step(1);
    }
  });

  /* Esc, the close button and the backdrop all end here, which is the only place the
     viewer's URLs are released. */
  dialog.addEventListener('close', () => {
    image.removeAttribute('src');
    urls.revokeAll();
    records = [];

    if (returnFocusTo) {
      returnFocusTo.focus();
      returnFocusTo = null;
    }
  });

  return { open, isOpen: () => dialog.open };
}
