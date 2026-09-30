import { DATE_PATTERN } from '../data/schema.js';
import { EMPTY_FILTERS } from './apply-filters.js';
import { isRealCalendarDate } from '../data/validate.js';

const TAG_SEPARATOR = ',';

function sanitizeDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value) || !isRealCalendarDate(value)) {
    return null;
  }
  return value;
}

function sanitizeTags(value) {
  if (typeof value !== 'string') {
    return [];
  }

  const tags = new Set();
  for (const part of value.split(TAG_SEPARATOR)) {
    const tag = part.trim().toLowerCase();
    if (tag !== '') {
      tags.add(tag);
    }
  }

  return [...tags].sort();
}

/* Empty values are left out entirely rather than written as blanks, so an unfiltered
   view has a clean URL with no query string at all. */
export function serializeFilters(filters) {
  const settled = { ...EMPTY_FILTERS, ...filters };
  const params = new URLSearchParams();

  if (typeof settled.query === 'string' && settled.query.trim() !== '') {
    params.set('q', settled.query.trim());
  }

  const tags = Array.isArray(settled.tags) ? settled.tags.filter(Boolean) : [];
  if (tags.length > 0) {
    params.set('tags', tags.join(TAG_SEPARATOR));
  }

  if (settled.from) {
    params.set('from', settled.from);
  }

  if (settled.to) {
    params.set('to', settled.to);
  }

  return params;
}

/* A URL can be edited, shared or half-remembered, so nothing from it is trusted: an
   unparseable date is dropped rather than applied, and a backwards range is corrected
   instead of silently matching nothing. */
export function parseFilters(search) {
  const params = new URLSearchParams(search ?? '');

  const query = params.get('q') ?? '';
  const tags = sanitizeTags(params.get('tags'));

  let from = sanitizeDate(params.get('from'));
  let to = sanitizeDate(params.get('to'));

  if (from && to && from > to) {
    [from, to] = [to, from];
  }

  return { query: typeof query === 'string' ? query.trim() : '', tags, from, to };
}
