import { createObjectUrlPool } from './object-urls.js';
import { formatLongDate } from './format-date.js';

/* One memory, in full, where the list was.

   Everything a memory holds used to be crammed into a 280px popup floating over a map that
   moves: the note in full, the tags, and Edit, Move and Delete side by side at 11px. This is
   the surface that content was always asking for. It takes the sidebar's place rather than
   opening over it, so the map it describes is still there beside it on a wide screen.

   The module owns the view and nothing else. It does not know what a memory is beyond the
   fields it renders, it does not touch the store, and it does not know anything about the
   URL: main.js wires the back request to the history rules, because closing is sometimes a
   history.back() and sometimes not.

   Every value that came from the user goes in through textContent, so a title or a note of
   <img src=x onerror=...> renders as the characters the user typed. */

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

export function createDetailView({
  sectionElement,
  contentElement,
  backButton,
  previousButton,
  nextButton,
  bodyElement = document.body,
  loadPhotos,
  onOpenLightbox,
  onSelectTag,
  onBack,
  onPrevious,
  onNext,
  onError = () => {},
  /* Escape belongs to whatever is already using it. Placement and move mode both attach
     their own handler while they are active, and a move started from this view has to be
     revertable without the view disappearing from under it. */
  isBlocked = () => false
}) {
  /* This view's own pool, revoked in exactly two places: when it renders a different memory
     and when it closes. The list cannot work this way - its rows come and go and there is no
     moment when they are all finished with - but one memory at a time has exactly that
     moment, which is why this is a pool and not a second thumbnail owner. */
  const urls = createObjectUrlPool();

  let openId = null;

  /* Bumped on every render. Reading the blobs out of IndexedDB takes a moment, and holding
     Next steps through memories faster than that: without this, a read for a memory three
     back lands, creates its URLs and paints them into a view showing something else. The
     token is checked before a single URL is created, so a superseded read leaks nothing
     rather than leaking something nothing is left to revoke. */
  let renderToken = 0;

  function buildPhotoButton(records, index, memory, blob, className) {
    const button = element('button', className);
    button.type = 'button';

    const image = document.createElement('img');
    image.src = urls.create(blob);
    image.alt = 'Photo ' + (index + 1) + ' of ' + records.length + ', ' + memory.title;
    image.decoding = 'async';
    /* A native image drag fires pointercancel, which the lightbox's swipe depends on not
       seeing; the same reasoning as the lightbox image itself. */
    image.draggable = false;

    button.append(image);
    button.addEventListener('click', () => onOpenLightbox(records, index, memory, button));

    return button;
  }

  async function fillPhotos(memory, token, hero, thumbs) {
    const records = await loadPhotos(memory.photoIds);

    /* Previous or Next has moved on, so these records belong to a view that is no longer on
       screen. Checked before urls.create, never after. */
    if (token !== renderToken || records.length === 0) {
      return;
    }

    hero.replaceChildren(
      buildPhotoButton(records, 0, memory, records[0].blob, 'detail-hero-button')
    );

    if (records.length < 2) {
      return;
    }

    for (const [index, record] of records.entries()) {
      const item = element('li');
      item.append(
        buildPhotoButton(records, index, memory, record.thumb, 'detail-thumb-button')
      );
      thumbs.append(item);
    }

    thumbs.hidden = false;
  }

  /* A line of its own rather than a label and a value, because nobody reads coordinates as a
     field: they copy them, or they check them against something else. The words are there for
     a screen reader, which otherwise gets two numbers and no idea what they are. */
  function buildCoordinates(memory) {
    const line = element('p', 'detail-coordinates');
    line.append(element('span', 'visually-hidden', 'Coordinates: '));
    line.append(document.createTextNode(memory.lat + ', ' + memory.lng));
    return line;
  }

  function buildTags(memory) {
    const list = element('ul', 'detail-tags');

    for (const tag of memory.tags) {
      const item = element('li');
      const button = element('button', 'chip chip-tag detail-tag', tag);
      button.type = 'button';
      /* The tag reads as a label and this is the control that acts on it, so the name says
         what pressing it does. */
      button.setAttribute('aria-label', 'Filter by tag ' + tag);
      button.addEventListener('click', () => onSelectTag(tag));
      item.append(button);
      list.append(item);
    }

    return list;
  }

  function renderBody(memory) {
    const token = (renderToken += 1);

    /* Before anything new is created. The images they belong to are about to leave the
       document, so there is nothing left to revoke them for. */
    urls.revokeAll();

    const parts = [];

    /* No hero at all without photos, rather than a frame around nothing: an empty box the
       size of a photograph is a worse answer than the heading simply starting at the top. */
    const hero = memory.photoIds.length > 0 ? element('div', 'detail-hero') : null;
    const thumbs = element('ul', 'detail-thumbs');
    thumbs.hidden = true;

    if (hero) {
      parts.push(hero, thumbs);
    }

    const title = element('h2', 'detail-title', memory.title);
    title.id = 'detail-title';
    /* Focus lands here when the view opens, which is how a screen reader is told that the
       list it was in has been replaced and by what. */
    title.tabIndex = -1;
    parts.push(title);

    parts.push(element('p', 'detail-date', formatLongDate(memory.date)));

    if (memory.placeName) {
      parts.push(element('p', 'detail-place', memory.placeName));
    }

    if (memory.note) {
      /* Line breaks are kept by white-space in CSS rather than by injecting <br>. */
      parts.push(element('p', 'detail-note', memory.note));
    }

    if (memory.tags.length > 0) {
      parts.push(buildTags(memory));
    }

    parts.push(buildCoordinates(memory));

    contentElement.replaceChildren(...parts);
    contentElement.scrollTop = 0;

    if (hero) {
      fillPhotos(memory, token, hero, thumbs).catch(onError);
    }

    return title;
  }

  /* aria-disabled, not disabled: the buttons stay in the tab order at the ends, so stepping
     to the last memory cannot drop focus off the button that was just pressed. They do
     nothing instead, which main.js enforces by passing null. */
  function setNeighbours({ previous, next }) {
    previousButton.setAttribute('aria-disabled', String(!previous));
    nextButton.setAttribute('aria-disabled', String(!next));
  }

  function render(memory) {
    openId = memory.id;
    return renderBody(memory);
  }

  function open(memory) {
    const title = render(memory);

    sectionElement.hidden = false;
    bodyElement.setAttribute('data-detail', '');

    /* After the view is on screen: focus() on something still display:none does nothing at
       all, and the failure is silent. */
    title.focus();
  }

  function close() {
    if (openId === null) {
      return null;
    }

    const closed = openId;
    openId = null;

    /* Anything still in flight is now for a view that has gone. */
    renderToken += 1;

    sectionElement.hidden = true;
    bodyElement.removeAttribute('data-detail');
    contentElement.replaceChildren();
    urls.revokeAll();

    return closed;
  }

  backButton.addEventListener('click', () => onBack());
  previousButton.addEventListener('click', () => onPrevious());
  nextButton.addEventListener('click', () => onNext());

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || openId === null) {
      return;
    }

    const target = event.target;
    const typing =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target && target.isContentEditable);

    /* A dialog has its own Escape and the browser handles it; closing this underneath an
       open dialog would leave the dialog over a view that is no longer there. */
    if (typing || document.querySelector('dialog[open]') || isBlocked()) {
      return;
    }

    onBack();
  });

  return {
    open,
    close,
    render,
    setNeighbours,
    openId: () => openId,
    isOpen: () => openId !== null,
    liveUrlCount: () => urls.size()
  };
}
