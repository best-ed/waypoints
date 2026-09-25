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

function buildTagList(tags) {
  const list = element('ul', 'popup-tags');
  for (const tag of tags) {
    list.append(element('li', 'popup-tag', tag));
  }
  return list;
}

function buildActions({ onEdit, onMove, onDelete }) {
  const actions = element('div', 'popup-actions');

  for (const [label, handler] of [
    ['Edit', onEdit],
    ['Move', onMove],
    ['Delete', onDelete]
  ]) {
    const button = element('button', 'button popup-button', label);
    button.type = 'button';
    button.addEventListener('click', handler);
    actions.append(button);
  }

  return actions;
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

  if (memory.tags.length > 0) {
    root.append(buildTagList(memory.tags));
  }

  root.append(buildActions(handlers));

  return root;
}
