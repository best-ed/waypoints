import { formatMemoryDate } from './format-date.js';
import { isFilterActive } from '../filters/apply-filters.js';

function tagPart(tags) {
  if (tags.length === 0) {
    return null;
  }
  return tags.length === 1 ? '1 tag' : tags.length + ' tags';
}

function datePart({ from, to }) {
  if (from && to) {
    return formatMemoryDate(from) + ' to ' + formatMemoryDate(to);
  }
  if (from) {
    return 'from ' + formatMemoryDate(from);
  }
  if (to) {
    return 'up to ' + formatMemoryDate(to);
  }
  return null;
}

/* How many, in words. It used to also list the dimensions - "0 of 60 · search · 1 tag" -
   which read as a machine's summary and now duplicates the chips above it, where each
   dimension is named and can be taken off. */
export function buildSummary(shown, total, filters) {
  if (total === 0) {
    return 'None yet';
  }

  if (!isFilterActive(filters)) {
    return total === 1 ? '1 memory' : total + ' memories';
  }

  return shown + ' of ' + total + (total === 1 ? ' memory' : ' memories');
}

/* Kept because the chip labels want the same date wording, and so the two cannot drift. */
export function describeFilterParts(filters) {
  return [tagPart(filters.tags), datePart(filters)].filter(Boolean);
}

export function createFilterSummary({ summaryElement }) {
  function render(shown, total, filters) {
    summaryElement.textContent = buildSummary(shown, total, filters);
  }

  return { render };
}
