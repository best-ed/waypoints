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

/* Says what is being filtered on rather than repeating the query back, so the line is
   short regardless of how long the search text is. */
export function buildSummary(shown, total, filters) {
  if (!isFilterActive(filters)) {
    return '';
  }

  const parts = [shown + ' of ' + total];

  if (filters.query.trim() !== '') {
    parts.push('search');
  }

  const tags = tagPart(filters.tags);
  if (tags) {
    parts.push(tags);
  }

  const dates = datePart(filters);
  if (dates) {
    parts.push(dates);
  }

  return parts.join(' · ');
}

export function createFilterSummary({ summaryElement, resetElement, onReset }) {
  function render(shown, total, filters) {
    const text = buildSummary(shown, total, filters);
    const active = text !== '';

    summaryElement.textContent = active ? text : countOnly(shown, total);
    resetElement.hidden = !active;
  }

  function countOnly(shown, total) {
    if (total === 0) {
      return 'None yet';
    }
    return total === 1 ? '1 memory' : total + ' memories';
  }

  resetElement.addEventListener('click', () => onReset());

  return { render };
}
