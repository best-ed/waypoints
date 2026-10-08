import { createIcon } from './icons.js';
import { formatMemoryDate } from './format-date.js';

/* Every value that came from the user goes in through textContent. Nothing in this file
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

function buildTagList(tags, onToggleTag) {
  const list = element('ul', 'popup-tags');

  for (const tag of tags) {
    const item = element('li');
    const button = element('button', 'popup-tag', tag);
    button.type = 'button';
    button.setAttribute('aria-label', 'Filter by tag ' + tag);
    button.addEventListener('click', () => onToggleTag(tag));
    item.append(button);
    list.append(item);
  }

  return list;
}

function buildActions({ onEdit, onMove, onDelete }) {
  const actions = element('div', 'popup-actions');

  for (const [label, icon, handler] of [
    ['Edit', 'settings', onEdit],
    ['Move', 'pin', onMove],
    ['Delete', 'close', onDelete]
  ]) {
    const button = element('button', 'button popup-button');
    button.type = 'button';
    button.append(createIcon(icon, { size: 16 }), element('span', 'button-label', label));
    button.addEventListener('click', handler);
    actions.append(button);
  }

  return actions;
}

/* Filled in asynchronously by the caller once the blobs are read, because popup content
   has to be handed to Leaflet synchronously. */
function buildPhotoStrip() {
  return element('ul', 'popup-photos');
}

export function findPhotoStrip(root) {
  return root.querySelector('.popup-photos');
}

export function buildPopupContent(memory, handlers) {
  const root = element('div', 'popup');

  root.append(element('h2', 'popup-title', memory.title));
  root.append(element('p', 'popup-date', formatMemoryDate(memory.date)));

  if (memory.placeName) {
    root.append(element('p', 'popup-place', memory.placeName));
  }

  if (memory.note) {
    /* Line breaks are preserved by white-space in CSS rather than by injecting <br>. */
    root.append(element('p', 'popup-note', memory.note));
  }

  if (memory.photoIds.length > 0) {
    root.append(buildPhotoStrip());
  }

  if (memory.tags.length > 0) {
    root.append(buildTagList(memory.tags, handlers.onToggleTag));
  }

  root.append(buildActions(handlers));

  return root;
}
