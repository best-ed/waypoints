import { createIcon } from './icons.js';
import { formatMemoryDate } from './format-date.js';

/* A preview, not a page. The popup used to carry the whole memory - the note in full, the
   tags, and Edit, Move and Delete - squeezed into 280px floating over the map, which is the
   narrowest and least stable surface in the app. Three buttons at 11px wide enough apart to
   hit, under a note of up to five thousand characters, over a map that pans out from under
   them. All of that is in the detail view now, and what is left here is enough to recognise
   the pin you clicked: the picture, the title, when and where, and a way in.

   Every value that came from the user goes in through textContent. Nothing in this file
   builds markup from a string, so a title of <img src=x onerror=...> renders as the
   characters the user typed. */
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

/* Leaflet's own close control is turned off in markers-layer.js, so this is the popup's
   close button. A real button with a real name: the link it replaced pointed at "#close",
   which matches nothing, and a screen reader had no way to tell what it did. */
function buildClose(onClose) {
  const button = element('button', 'button button-sm button-ghost icon-only popup-close');
  button.type = 'button';
  button.setAttribute('aria-label', 'Close');
  button.append(createIcon('close', { size: 16 }));
  button.addEventListener('click', () => onClose());
  return button;
}

/* The image is filled in asynchronously by the caller once the blob is read, because popup
   content has to be handed to Leaflet synchronously. The bed is painted meanwhile, so the
   popup does not change height when the picture lands. */
function buildCover() {
  const cover = element('div', 'popup-cover');

  const image = document.createElement('img');
  image.className = 'popup-cover-image';
  /* Decorative: the title beside it is the name of this memory, and "Photo of <title>"
     underneath it would only be the same thing twice. */
  image.alt = '';
  image.decoding = 'async';
  image.hidden = true;

  cover.append(image);
  return cover;
}

export function findPopupCover(root) {
  return root.querySelector('.popup-cover');
}

/* One muted line. The date and the place are the two things that place a memory, and keeping
   them on one line is what lets the popup stay the height of a preview. */
function metaLine(memory) {
  const parts = [formatMemoryDate(memory.date)];

  if (memory.placeName) {
    parts.push(memory.placeName);
  }

  return parts.join(' · ');
}

export function buildPopupContent(memory, handlers) {
  const root = element('div', 'popup');

  /* First in the DOM so it is first in the tab order: the popup opens with focus on the map,
     and a reader tabbing in should be able to get out again before reading the whole thing. */
  root.append(buildClose(handlers.onClose));

  if (memory.photoIds.length > 0) {
    root.append(buildCover());
  }

  root.append(element('h2', 'popup-title', memory.title));
  root.append(element('p', 'popup-meta', metaLine(memory)));

  const open = element('button', 'button button-primary popup-open');
  open.type = 'button';
  open.append(element('span', 'button-label', 'Open'));
  open.addEventListener('click', () => handlers.onOpen());
  root.append(open);

  return root;
}
