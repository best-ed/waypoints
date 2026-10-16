import { describeActiveFilters } from '../filters/describe-filters.js';

/* The row of removable chips under the search box: what is narrowing the list right now, and
   a way to take any of it off.

   This is the only clear-filters control in the app. There used to be two, a "Reset filters"
   link in the sidebar header and a "Clear filters" button in the empty state, visible at the
   same time, doing the same thing, with different labels and different shapes. */

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function createActiveFilters({ listElement, onRemove, onClearAll, createIcon }) {
  function buildChip(chip) {
    const item = element('li');
    const button = element('button', 'chip chip-filter chip-removable');
    button.type = 'button';

    button.append(element('span', 'chip-label', chip.label));

    if (createIcon) {
      button.append(createIcon('close', { size: 14 }));
    }

    /* The chip's whole job is removal, so that is its name. The label alone would announce as
       a tag, which is the thing it is not: it is the control that takes the tag off. */
    button.setAttribute('aria-label', chip.removeLabel);
    button.addEventListener('click', () => onRemove(chip.remove));

    item.append(button);
    return item;
  }

  function render(filters) {
    const chips = describeActiveFilters(filters);

    listElement.replaceChildren();
    listElement.hidden = chips.length === 0;

    if (chips.length === 0) {
      return;
    }

    for (const chip of chips) {
      listElement.append(buildChip(chip));
    }

    /* Offered only when there is more than one thing to clear. With a single chip, "Clear
       all" and the chip itself do exactly the same thing, which is the duplication this row
       exists to remove. */
    if (chips.length > 1) {
      const item = element('li');
      const button = element('button', 'button button-sm button-ghost clear-all');
      button.type = 'button';
      button.append(element('span', 'button-label', 'Clear all'));
      button.addEventListener('click', () => onClearAll());
      item.append(button);
      listElement.append(item);
    }
  }

  return { render };
}
