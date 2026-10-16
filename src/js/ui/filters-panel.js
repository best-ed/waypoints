import { countActiveDimensions } from '../filters/describe-filters.js';

/* The Filters disclosure: one button that opens a panel holding the tag chips, the timeline
   and the date inputs.

   Those three took two thirds of the sidebar before anything a person came to look at. They
   are precision instruments and they do not need to be open at rest, so the default is
   closed - unless the URL arrived with filters already applied, in which case opening them is
   the only way the page explains itself.

   The remembered state is a convenience and nothing depends on it: storage is wrapped at both
   ends, because reading localStorage throws outright when site data is blocked. */

export const PANEL_STATE_KEY = 'waypoints:filters-open';

export function createFiltersPanel({
  toggleElement,
  panelElement,
  badgeElement,
  storage = null,
  storageKey = PANEL_STATE_KEY
}) {
  let open = false;

  function remembered() {
    try {
      return storage?.getItem(storageKey) === 'open';
    } catch {
      return false;
    }
  }

  function remember(value) {
    try {
      storage?.setItem(storageKey, value ? 'open' : 'closed');
    } catch {
      /* A preference that cannot be written is still applied for this session. */
    }
  }

  function apply() {
    toggleElement.setAttribute('aria-expanded', String(open));
    panelElement.hidden = !open;
  }

  function setOpen(next, { persist = true } = {}) {
    open = Boolean(next);
    apply();
    if (persist) remember(open);
  }

  toggleElement.addEventListener('click', () => setOpen(!open));

  /* Called on every render, so the badge follows the filters without anything else having to
     tell it. The open state is only forced once, at boot, by start(). */
  function render(filters) {
    const count = countActiveDimensions(filters);

    badgeElement.textContent = String(count);
    badgeElement.hidden = count === 0;

    /* The button's own name stays "Filters"; the count is read as part of it, and the number
       alone would announce as a bare digit. */
    toggleElement.setAttribute(
      'aria-label',
      count === 0 ? 'Filters' : 'Filters, ' + count + (count === 1 ? ' active' : ' active')
    );
  }

  /* Open because the URL said so, otherwise whatever was remembered. A filtered view arriving
     from a bookmark with the panel shut would show a short list and no reason for it. */
  function start(filters) {
    setOpen(countActiveDimensions(filters) > 0 || remembered(), { persist: false });
    render(filters);
  }

  return {
    render,
    start,
    isOpen: () => open,
    setOpen
  };
}
