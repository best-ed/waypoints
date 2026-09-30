import { matchesQuery } from './match-memory.js';

export const EMPTY_FILTERS = Object.freeze({ query: '', tags: [], from: null, to: null });

function memoryTags(memory) {
  return Array.isArray(memory?.tags) ? memory.tags : [];
}

/* YYYY-MM-DD sorts correctly as a string, so the range is compared directly. Building a
   Date here would parse as local midnight and shift the day for anyone off UTC. */
function withinRange(date, from, to) {
  if (typeof date !== 'string' || date === '') {
    return false;
  }
  if (from && date < from) {
    return false;
  }
  if (to && date > to) {
    return false;
  }
  return true;
}

/* One predicate per filter dimension. Adding another means adding an entry here and
   nothing else: applyFilters requires all the active ones, isFilterActive asks each
   whether it is narrowing anything, and tagCounts excludes them by name. */
const PREDICATES = [
  {
    name: 'query',
    isActive: (filters) => filters.query.trim() !== '',
    matches: (memory, filters) => matchesQuery(memory, filters.query)
  },
  {
    name: 'tags',
    isActive: (filters) => filters.tags.length > 0,
    /* ANY within tags: one selected tag on the memory is enough. Across facets it is
       still AND, which is what makes tag chips read as a union. */
    matches: (memory, filters) => memoryTags(memory).some((tag) => filters.tags.includes(tag))
  },
  {
    name: 'dates',
    isActive: (filters) => Boolean(filters.from) || Boolean(filters.to),
    matches: (memory, filters) => withinRange(memory?.date, filters.from, filters.to)
  }
];

export function settleFilters(filters) {
  const settled = { ...EMPTY_FILTERS, ...filters };
  settled.tags = Array.isArray(settled.tags) ? settled.tags : [];
  settled.query = typeof settled.query === 'string' ? settled.query : '';
  return settled;
}

export function activePredicates(filters, { except = null } = {}) {
  const settled = settleFilters(filters);
  return PREDICATES.filter(
    (predicate) => predicate.name !== except && predicate.isActive(settled)
  );
}

export function isFilterActive(filters) {
  return activePredicates(filters).length > 0;
}

/* except lets a facet exclude itself, which is how faceted tag counts are built: the
   counts show what selecting each tag would give, so the tag filter cannot apply. */
export function applyFilters(memories, filters, { except = null } = {}) {
  const list = Array.isArray(memories) ? memories : [];
  const settled = settleFilters(filters);
  const active = activePredicates(settled, { except });

  if (active.length === 0) {
    return [...list];
  }

  return list.filter((memory) => active.every((predicate) => predicate.matches(memory, settled)));
}
