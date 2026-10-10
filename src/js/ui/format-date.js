import { DATE_PATTERN } from '../data/schema.js';

const DISPLAY_LOCALE = 'en-GB';
const DISPLAY_OPTIONS = { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' };

/* The detail view has the width for the whole thing, and a memory is a date in someone's
   life rather than a row in a table: the weekday is part of remembering it. */
const LONG_OPTIONS = {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC'
};

const formatters = new Map();

/* Built once on first use rather than at import time, since constructing an
   Intl.DateTimeFormat is expensive and modules must not do work when loaded. */
function formatterFor(options) {
  let formatter = formatters.get(options);

  if (!formatter) {
    formatter = new Intl.DateTimeFormat(DISPLAY_LOCALE, options);
    formatters.set(options, formatter);
  }

  return formatter;
}

/* The stored value is a calendar day with no time or zone. Parsing "2025-03-04" with the
   Date constructor gives midnight UTC, which formats as 3 March anywhere behind UTC, so
   the parts are placed in UTC and read back in UTC. */
function format(value, options) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    return '';
  }

  const [year, month, day] = value.split('-').map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));

  if (Number.isNaN(utcDate.getTime())) {
    return '';
  }

  return formatterFor(options).format(utcDate);
}

export function formatMemoryDate(value) {
  return format(value, DISPLAY_OPTIONS);
}

export function formatLongDate(value) {
  return format(value, LONG_OPTIONS);
}
