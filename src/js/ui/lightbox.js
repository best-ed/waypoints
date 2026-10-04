import { createObjectUrlPool } from './object-urls.js';

/* Far enough that a tap or a small wobble cannot page the photo, close enough that a deliberate
   flick does. */
const SWIPE_MIN_DISTANCE = 48;

export function createLightbox({ document: doc = document, reducedMotion = () => false }) {
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

  /* Restarting a CSS animation needs the class gone and the layout flushed before it goes
     back on, or the browser coalesces the two changes and nothing plays. */
  function slide(offset) {
    if (reducedMotion()) {
      return;
    }

    image.classList.remove('slide-next', 'slide-prev');
    void image.offsetWidth;
    image.classList.add(offset > 0 ? 'slide-next' : 'slide-prev');
  }

  function step(offset) {
    if (records.length < 2) {
      return;
    }
    index = (index + offset + records.length) % records.length;
    show();
    slide(offset);
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

  /* Pointer events rather than touch events, so a mouse drag and a pen work the same way.
     Only the primary pointer: a second finger landing mid-pinch must not page the photo. */
  let swipeFrom = null;

  dialog.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary) {
      swipeFrom = null;
      return;
    }
    swipeFrom = { x: event.clientX, y: event.clientY, id: event.pointerId };
  });

  dialog.addEventListener('pointerup', (event) => {
    if (!swipeFrom || event.pointerId !== swipeFrom.id) {
      return;
    }

    const dx = event.clientX - swipeFrom.x;
    const dy = event.clientY - swipeFrom.y;
    swipeFrom = null;

    if (Math.abs(dx) < SWIPE_MIN_DISTANCE) {
      return;
    }

    /* The horizontal travel has to beat the vertical, or scrolling a tall photo would page it
       sideways on the way past. */
    if (Math.abs(dx) <= Math.abs(dy)) {
      return;
    }

    /* Swiping left brings the next photo in from the right, like turning a page. */
    step(dx < 0 ? 1 : -1);
  });

  dialog.addEventListener('pointercancel', () => {
    swipeFrom = null;
  });

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
