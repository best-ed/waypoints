import { formatMemoryDate } from './format-date.js';
import { sortForList } from './sort-for-list.js';
import { groupMemoriesByYear } from './group-by-year.js';
import { dateRangeLabel } from '../filters/describe-filters.js';
import { createIcon } from './icons.js';

/* The fields a card actually shows. Anything else changing on a memory leaves its DOM
   untouched. The first photo id is in here because it is the cover: changing which photo
   comes first changes the picture, and nothing else would notice. */
function itemSignature(memory) {
  return JSON.stringify([
    memory.title,
    memory.date,
    memory.placeName,
    memory.tags?.length ?? 0,
    memory.photoIds?.[0] ?? null
  ]);
}

const coverIdOf = (memory) => memory.photoIds?.[0] ?? null;

function element(tag, className) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

/* Names what is excluding everything, in the words the chips use, so the message and the
   chips above it describe the same thing. "the current filters" is true and useless: the
   whole question is which of them. */
function describeNoMatch(filters) {
  const reasons = [];
  const query = filters?.query?.trim() ?? '';

  if (query !== '') {
    reasons.push('your search');
  }

  const tags = filters?.tags?.length ?? 0;
  if (tags > 0) {
    reasons.push(tags === 1 ? 'that tag' : 'those tags');
  }

  const range = dateRangeLabel(filters?.from, filters?.to);
  if (range) {
    reasons.push(range);
  }

  if (reasons.length === 0) {
    return 'Nothing matches the current filters.';
  }

  if (reasons.length === 1) {
    return 'Nothing matches ' + reasons[0] + '.';
  }

  const last = reasons.pop();
  return 'Nothing matches ' + reasons.join(', ') + ' and ' + last + ' together.';
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

export function createMemoryList({
  listElement,
  emptyElement,
  countElement,
  onSelect,
  onClearSearch,
  /* The owner of every object URL this list creates. Absent in tests and wherever photos are
     not wanted, in which case every card shows its placeholder and nothing is read. */
  thumbnails = null,
  /* Injected so the list can be rendered under node, where there is no observer at all. */
  IntersectionObserverImpl = typeof IntersectionObserver === 'function' ? IntersectionObserver : null
}) {
  const itemsById = new Map();
  const groupsByYear = new Map();
  let order = [];
  let selectedId = null;

  /* A margin of roughly one screen, so a row's picture is already there by the time it is
     scrolled to rather than arriving after it. */
  const observer =
    IntersectionObserverImpl && thumbnails
      ? new IntersectionObserverImpl(
          (entries) => {
            for (const entry of entries) {
              const item = itemsById.get(entry.target.dataset.memoryId);
              if (item) setShown(item, entry.isIntersecting);
            }
          },
          { root: listElement, rootMargin: '400px 0px' }
        )
      : null;

  function observe(item) {
    if (!observer || item.observed) return;
    item.listItem.dataset.memoryId = item.id;
    observer.observe(item.listItem);
    item.observed = true;
  }

  function unobserve(item) {
    if (!observer || !item.observed) return;
    observer.unobserve(item.listItem);
    item.observed = false;
  }

  /* One button for the whole card, named by the title alone. The date, the place and the
     tag count are description rather than name: a screen reader reads the title to identify
     the row and the rest only when it wants the detail, which is why they are referenced
     through aria-describedby instead of being concatenated into the name. */
  function createItem(memory) {
    const listItem = element('li', 'memory-item');
    const button = element('button', 'memory-button');
    button.type = 'button';

    const cover = element('span', 'memory-cover');
    /* The placeholder is what a card without a picture shows. It is not a missing image, so
       it is drawn rather than left as a gap. */
    cover.append(createIcon('photo', { size: 20, className: 'icon memory-cover-placeholder' }));

    const image = document.createElement('img');
    image.className = 'memory-cover-image';
    image.alt = '';
    image.decoding = 'async';
    image.hidden = true;
    cover.append(image);

    const body = element('span', 'memory-body');
    const title = element('span', 'memory-title');
    const meta = element('span', 'memory-meta');

    const describedBy = 'memory-meta-' + memory.id;
    meta.id = describedBy;
    button.setAttribute('aria-describedby', describedBy);

    body.append(title, meta);
    button.append(cover, body);
    listItem.append(button);
    button.addEventListener('click', () => onSelect(memory.id));

    return {
      id: memory.id,
      listItem,
      button,
      cover,
      image,
      title,
      meta,
      signature: null,
      coverId: null,
      shown: false,
      observed: false
    };
  }

  /* Date, place and tag count on one line. Separated by a middot rather than by three
     elements with their own margins, so the line has one rhythm however much of it there is. */
  function metaLine(memory) {
    const parts = [formatMemoryDate(memory.date)];

    if (memory.placeName) {
      parts.push(memory.placeName);
    }

    const tags = memory.tags?.length ?? 0;
    if (tags > 0) {
      parts.push(tags === 1 ? '1 tag' : tags + ' tags');
    }

    return parts.join(' \u00b7 ');
  }

  function updateItem(item, memory) {
    const signature = itemSignature(memory);
    if (item.signature === signature) {
      return;
    }

    item.title.textContent = memory.title;
    item.meta.textContent = metaLine(memory);
    item.signature = signature;

    const cover = coverIdOf(memory);

    /* The cover changed under a row that may already be showing the old one. */
    if (cover !== item.coverId) {
      hideCover(item);
      if (item.coverId) thumbnails?.release(item.coverId);
      item.coverId = cover;
      if (item.shown) showCover(item);
    }
  }

  function hideCover(item) {
    item.image.hidden = true;
    item.image.removeAttribute('src');
    item.cover.classList.remove('has-image');
  }

  async function showCover(item) {
    if (!thumbnails || !item.coverId) {
      return;
    }

    const wanted = item.coverId;
    const url = await thumbnails.request(wanted);

    /* The row may have scrolled away, or been reused for another memory, while the read was
       in flight. Checked before touching the DOM, or a card shows someone else's picture. */
    if (!url || item.coverId !== wanted || !item.shown) {
      return;
    }

    item.image.src = url;
    item.image.hidden = false;
    item.cover.classList.add('has-image');
  }

  /* Driven by the observer below: a row that is on screen, or nearly, asks for its cover;
     one that has left gives it back. */
  function setShown(item, shown) {
    if (item.shown === shown) {
      return;
    }

    item.shown = shown;

    if (shown) {
      showCover(item);
      return;
    }

    hideCover(item);
    if (item.coverId) thumbnails?.release(item.coverId);
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
        unobserve(item);
        setShown(item, false);
        item.listItem.remove();
        itemsById.delete(id);
      }
    }
  }

  /* A year: a real heading and the list of cards under it, cached so both are reused rather
     than rebuilt. The scroller is a div holding alternating headings and lists, so a card is
     an li inside a ul as it should be, and `.memory-list li` still means a memory.

     The keyed guarantee covers these too: a group that stays put is never torn out from
     under anything that has focus inside it. */
  function groupFor(year) {
    let group = groupsByYear.get(year);

    if (!group) {
      const heading = element('h3', 'year-heading');
      heading.textContent = year;

      const cards = element('ul', 'memory-group');
      cards.setAttribute('aria-label', year);

      group = { heading, cards };
      groupsByYear.set(year, group);
    }

    return group;
  }

  /* Walks the desired order against what is already in place and only moves a node when it is
     genuinely out of position, so an unchanged list touches nothing. Done twice over: the
     headings and lists within the scroller, and the cards within each list. */
  function place(parent, wanted) {
    let cursor = parent.firstChild;

    for (const node of wanted) {
      if (node === cursor) {
        cursor = cursor.nextSibling;
      } else {
        parent.insertBefore(node, cursor);
      }
    }
  }

  function applyOrder(groups) {
    const top = [];

    for (const { year, memories } of groups) {
      const group = groupFor(year);
      top.push(group.heading, group.cards);
      place(group.cards, memories.map((memory) => itemsById.get(memory.id).listItem));
    }

    place(listElement, top);

    /* Years that no longer have any cards. */
    const live = new Set(groups.map((group) => group.year));
    for (const [year, group] of groupsByYear) {
      if (!live.has(year)) {
        group.heading.remove();
        group.cards.remove();
        groupsByYear.delete(year);
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

    /* An empty library is the welcome block's state, not this one's. Saying "No memories yet"
       underneath a panel that already says "Start your map" is the same sentence twice. */
    if (total === 0) {
      emptyElement.hidden = true;
      return;
    }

    const message = element('span', 'empty-message');
    /* The cause is named rather than the query quoted back: with a tag and a date range also
       on, the text box is often not what emptied the list. */
    message.textContent = describeNoMatch(filters);
    emptyElement.append(message);

    /* The same label and the same shape as the one in the chips row, because it is the same
       action. There used to be two, "Reset filters" and "Clear filters", visible together. */
    const clear = element('button', 'button button-sm button-ghost empty-clear');
    clear.type = 'button';
    clear.append(createIcon('undo', { size: 16 }));
    const label = element('span', 'button-label');
    label.textContent = 'Clear all';
    clear.append(label);
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

    applyOrder(groupMemoriesByYear(ordered));
    order = ordered.map((memory) => memory.id);

    /* Rows that have gone are no longer observed, and rows that arrived are. */
    for (const item of itemsById.values()) observe(item);

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
      revealCard(selected);
    }
  }

  /* block: nearest on its own puts the card flush with the top of the scroller, which is
     exactly where the sticky year heading is, so the selected card lands underneath it. The
     heading's height is taken off by scrolling the extra amount by hand. */
  function revealCard(item) {
    item.button.scrollIntoView({ block: 'nearest' });

    const sticky = listElement.querySelector('.year-heading');

    if (!sticky) {
      return;
    }

    const headerHeight = sticky.getBoundingClientRect().height;
    const cardTop = item.listItem.getBoundingClientRect().top;
    const listTop = listElement.getBoundingClientRect().top;
    const hiddenBehindHeader = listTop + headerHeight - cardTop;

    if (hiddenBehindHeader > 0) {
      listElement.scrollTop -= hiddenBehindHeader;
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

  function dispose() {
    if (observer) observer.disconnect();
    for (const item of itemsById.values()) setShown(item, false);
  }

  return {
    render,
    dispose,
    setSelected,
    focusItem,
    focusEmptyState,
    focusAtPosition,
    getOrder: () => [...order],
    count: () => itemsById.size
  };
}
