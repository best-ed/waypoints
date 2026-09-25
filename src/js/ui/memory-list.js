import { formatMemoryDate } from './format-date.js';
import { sortForList } from './sort-for-list.js';

/* The fields a list item actually shows. Anything else changing on a memory leaves the
   item's DOM untouched. */
function itemSignature(memory) {
  return JSON.stringify([memory.title, memory.date, memory.placeName]);
}

function element(tag, className) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

const EMPTY_MESSAGE = 'No memories yet. Click Add memory, then click the map.';

function countLabel(total) {
  if (total === 0) {
    return 'None yet';
  }
  return total === 1 ? '1 memory' : total + ' memories';
}

export function createMemoryList({ listElement, emptyElement, countElement, onSelect }) {
  const itemsById = new Map();
  let order = [];

  function createItem(memory) {
    const listItem = element('li', 'memory-item');
    const button = element('button', 'memory-button');
    button.type = 'button';

    const title = element('span', 'memory-title');
    const meta = element('span', 'memory-meta');
    const place = element('span', 'memory-place');

    button.append(title, meta, place);
    listItem.append(button);
    button.addEventListener('click', () => onSelect(memory.id));

    return { listItem, button, title, meta, place, signature: null };
  }

  function updateItem(item, memory) {
    const signature = itemSignature(memory);
    if (item.signature === signature) {
      return;
    }

    item.title.textContent = memory.title;
    item.meta.textContent = formatMemoryDate(memory.date);
    item.place.textContent = memory.placeName;
    item.place.hidden = memory.placeName === '';
    item.signature = signature;
  }

  function focusedId() {
    for (const [id, item] of itemsById) {
      if (item.button === document.activeElement) {
        return id;
      }
    }
    return null;
  }

  function removeMissing(liveIds) {
    for (const [id, item] of itemsById) {
      if (!liveIds.has(id)) {
        item.listItem.remove();
        itemsById.delete(id);
      }
    }
  }

  /* Walks the desired order against the children already in place and only moves a node
     when it is genuinely out of position, so an unchanged list touches nothing. */
  function applyOrder(ordered) {
    let cursor = listElement.firstChild;

    for (const memory of ordered) {
      const item = itemsById.get(memory.id);
      if (item.listItem === cursor) {
        cursor = cursor.nextSibling;
      } else {
        listElement.insertBefore(item.listItem, cursor);
      }
    }
  }

  function render(memories) {
    const ordered = sortForList(memories);
    const liveIds = new Set(ordered.map((memory) => memory.id));

    /* Moving a node in the DOM can drop focus, so it is put back afterwards unless the
       memory that had it was the one deleted. */
    const previouslyFocused = focusedId();

    removeMissing(liveIds);

    for (const memory of ordered) {
      let item = itemsById.get(memory.id);
      if (!item) {
        item = createItem(memory);
        itemsById.set(memory.id, item);
      }
      updateItem(item, memory);
    }

    applyOrder(ordered);
    order = ordered.map((memory) => memory.id);

    countElement.textContent = countLabel(ordered.length);
    emptyElement.textContent = EMPTY_MESSAGE;
    emptyElement.hidden = ordered.length > 0;
    listElement.hidden = ordered.length === 0;

    if (previouslyFocused && itemsById.has(previouslyFocused) && document.activeElement !== itemsById.get(previouslyFocused).button) {
      itemsById.get(previouslyFocused).button.focus();
    }
  }

  function focusItem(id) {
    const item = itemsById.get(id);
    if (item) {
      item.button.focus();
      return true;
    }
    return false;
  }

  function focusEmptyState() {
    emptyElement.focus();
  }

  return {
    render,
    focusItem,
    focusEmptyState,
    getOrder: () => [...order],
    count: () => itemsById.size
  };
}
