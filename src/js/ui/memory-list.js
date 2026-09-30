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

function describeNoMatch(filters) {
  const reasons = [];

  if (filters?.tags?.length > 0) {
    reasons.push(filters.tags.length === 1 ? 'that tag' : 'those tags');
  }
  if (filters?.from || filters?.to) {
    reasons.push('that date range');
  }

  if (reasons.length === 0) {
    return 'No memories match the current filters';
  }

  return 'No memories match ' + reasons.join(' and ');
}

function countLabel(shown, total) {
  if (total === 0) {
    return 'None yet';
  }
  if (shown < total) {
    return shown + ' of ' + total;
  }
  return total === 1 ? '1 memory' : total + ' memories';
}

export function createMemoryList({ listElement, emptyElement, countElement, onSelect, onClearSearch }) {
  const itemsById = new Map();
  let order = [];
  let selectedId = null;

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

  /* Two different empty states: nothing saved yet, and nothing matching the search.
     The query is user text, so it goes in through textContent like everything else. */
  function updateEmptyState(shown, total, query, filters) {
    emptyElement.replaceChildren();
    emptyElement.hidden = shown > 0;

    if (shown > 0) {
      return;
    }

    if (total === 0) {
      emptyElement.append(element('span', 'empty-message'));
      emptyElement.firstChild.textContent = EMPTY_MESSAGE;
      return;
    }

    const message = element('span', 'empty-message');
    /* The cause is not always the text box, so the message says which filters are in
       play rather than quoting an empty query back at the user. */
    message.textContent =
      query.trim() === ''
        ? describeNoMatch(filters)
        : 'No memories match "' + query + '"';
    emptyElement.append(message);

    const clear = element('button', 'button empty-clear');
    clear.type = 'button';
    clear.textContent = 'Clear filters';
    clear.addEventListener('click', () => onClearSearch());
    emptyElement.append(clear);
  }

  function render(memories, { total = memories.length, query = '', filters = null } = {}) {
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

    for (const [itemId, item] of itemsById) {
      applySelectionTo(item, itemId === selectedId);
    }

    countElement.textContent = countLabel(ordered.length, total);
    updateEmptyState(ordered.length, total, query, filters);
    listElement.hidden = ordered.length === 0;

    if (previouslyFocused && itemsById.has(previouslyFocused) && document.activeElement !== itemsById.get(previouslyFocused).button) {
      itemsById.get(previouslyFocused).button.focus();
    }
  }

  function applySelectionTo(item, isSelected) {
    if (isSelected) {
      item.button.setAttribute('aria-current', 'true');
    } else {
      item.button.removeAttribute('aria-current');
    }
  }

  /* block: nearest leaves the list alone when the item is already visible, so selecting
     from the map does not yank the sidebar around. */
  function setSelected(id) {
    selectedId = id;

    for (const [itemId, item] of itemsById) {
      applySelectionTo(item, itemId === id);
    }

    const selected = id === null ? null : itemsById.get(id);
    if (selected) {
      selected.button.scrollIntoView({ block: 'nearest' });
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

  /* Called after a delete has already re-rendered the list. The item that slid up into
     the gap takes focus; if the deleted item was last, the new last one does; if nothing
     is left, the empty state does. Without this, focus falls to <body> when the popup
     holding the Delete button is torn down. */
  function focusAtPosition(index) {
    if (order.length === 0) {
      focusEmptyState();
      return;
    }

    const safeIndex = Math.max(0, Math.min(index, order.length - 1));
    focusItem(order[safeIndex]);
  }

  return {
    render,
    setSelected,
    focusItem,
    focusEmptyState,
    focusAtPosition,
    getOrder: () => [...order],
    count: () => itemsById.size
  };
}
