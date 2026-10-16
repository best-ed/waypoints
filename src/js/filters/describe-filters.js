/* Turns a filter state into the list of chips the sidebar shows above the list: one per tag,
   one for the date range, and the search is left out because the search box itself is already
   on screen showing what was typed.

   Pure, and it returns descriptors rather than nodes, so the shape can be tested without a
   DOM and the renderer stays the only thing that knows about elements.

   Each descriptor carries a `remove` patch rather than a type the caller has to switch on.
   Applying it is the whole of removing that filter, so there is no second place that has to
   know a date chip clears both ends while a tag chip clears only itself. */

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

/* YYYY-MM-DD to "Mar 2021". Built from the parts, never through a Date: new Date('2021-03-04')
   is midnight UTC, which is the previous day for anyone behind UTC. */
export function monthLabel(date) {
  if (typeof date !== 'string') {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(date);

  if (!match) {
    return null;
  }

  const month = Number(match[2]);

  if (month < 1 || month > 12) {
    return null;
  }

  return MONTHS[month - 1] + ' ' + match[1];
}

export function dateRangeLabel(from, to) {
  const start = monthLabel(from);
  const end = monthLabel(to);

  if (start && end) {
    /* The same month at both ends is one month, not a range from it to itself. */
    return start === end ? start : start + ' to ' + end;
  }

  if (start) {
    return 'From ' + start;
  }

  if (end) {
    return 'Up to ' + end;
  }

  return null;
}

export function describeActiveFilters(filters) {
  const source = filters !== null && typeof filters === 'object' ? filters : {};
  const tags = Array.isArray(source.tags) ? source.tags : [];
  const chips = [];

  for (const tag of tags) {
    if (typeof tag !== 'string' || tag.trim() === '') {
      continue;
    }

    chips.push({
      kind: 'tag',
      /* The id is for keying the rendered chips, so removing one does not rebuild the rest. */
      id: 'tag:' + tag,
      label: tag,
      removeLabel: 'Remove filter: ' + tag,
      remove: { tags: tags.filter((other) => other !== tag) }
    });
  }

  const range = dateRangeLabel(source.from, source.to);

  if (range) {
    chips.push({
      kind: 'dates',
      id: 'dates',
      label: range,
      removeLabel: 'Remove filter: ' + range,
      /* Both ends, because the chip stands for the range and not for one end of it. */
      remove: { from: null, to: null }
    });
  }

  return chips;
}

/* How many dimensions are filtering, which is what the Filters button's badge counts. The
   search is included here even though it has no chip: the badge says how much is narrowing
   the list, and a typed query narrows it. */
export function countActiveDimensions(filters) {
  const source = filters !== null && typeof filters === 'object' ? filters : {};
  const tags = Array.isArray(source.tags) ? source.tags : [];

  let count = 0;

  if (typeof source.query === 'string' && source.query.trim() !== '') count += 1;
  if (tags.length > 0) count += 1;
  if (source.from || source.to) count += 1;

  return count;
}
