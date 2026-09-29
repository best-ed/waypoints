import { matchesQuery } from './match-memory.js';

export const EMPTY_FILTERS = Object.freeze({ query: '' });

/* One predicate per filter dimension. Day 8's tags and date range become two more
   entries here and nothing else has to change: applyFilters already requires all of
   them, and isFilterActive already asks each one whether it is doing anything. */
const PREDICATES = [
  {
    name: 'query',
    isActive: (filters) => filters.query.trim() !== '',
    matches: (memory, filters) => matchesQuery(memory, filters.query)
  }
];

export function activePredicates(filters) {
  return PREDICATES.filter((predicate) => predicate.isActive(filters));
}

export function isFilterActive(filters) {
  return activePredicates(filters).length > 0;
}

export function applyFilters(memories, filters) {
  const list = Array.isArray(memories) ? memories : [];
  const active = activePredicates({ ...EMPTY_FILTERS, ...filters });

  if (active.length === 0) {
    return [...list];
  }

  const settled = { ...EMPTY_FILTERS, ...filters };
  return list.filter((memory) => active.every((predicate) => predicate.matches(memory, settled)));
}
