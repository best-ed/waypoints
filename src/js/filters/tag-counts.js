import { applyFilters } from './apply-filters.js';

/* Faceted: counted over the memories matching every filter except the tag filter itself.
   That is what makes a chip's number mean "this many more if you select me" rather than
   collapsing to the current selection. */
export function tagCounts(memories, filters) {
  const pool = applyFilters(memories, filters, { except: 'tags' });
  const counts = new Map();

  for (const memory of pool) {
    if (!Array.isArray(memory?.tags)) {
      continue;
    }
    for (const tag of new Set(memory.tags)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => (b.count === a.count ? a.tag.localeCompare(b.tag) : b.count - a.count));
}

export function allTags(memories) {
  const tags = new Set();

  for (const memory of Array.isArray(memories) ? memories : []) {
    if (!Array.isArray(memory?.tags)) {
      continue;
    }
    for (const tag of memory.tags) {
      tags.add(tag);
    }
  }

  return [...tags].sort();
}
