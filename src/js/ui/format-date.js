import { DATE_PATTERN } from '../data/schema.js';

const DISPLAY_LOCALE = 'en-GB';
const DISPLAY_OPTIONS = { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' };

let formatter = null;

/* Built once on first use rather than at import time, since constructing an
   Intl.DateTimeFormat is expensive and modules must not do work when loaded. */
function displayFormatter() {
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(DISPLAY_LOCALE, DISPLAY_OPTIONS);
  }
  return formatter;
}

/* The stored value is a calendar day with no time or zone. Parsing "2025-03-04" with the
   Date constructor gives midnight UTC, which formats as 3 March anywhere behind UTC, so
   the parts are placed in UTC and read back in UTC. */
export function formatMemoryDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    return '';
  }

  const [year, month, day] = value.split('-').map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));

  if (Number.isNaN(utcDate.getTime())) {
    return '';
  }

  return displayFormatter().format(utcDate);
}
