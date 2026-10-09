/* Splits the list into year groups, newest first, for the sticky headers.

   Pure. It takes the memories in the order the list already wants them - sortForList puts the
   newest first - and only groups them; it does not sort, because two places deciding the
   order is how the list and the map end up disagreeing. */

/* YYYY-MM-DD, read from the string. Never through a Date: new Date('2021-01-01') is midnight
   UTC, which lands in the previous year for anyone behind UTC, and the first of January is
   exactly where a year grouping would show it. */
export function yearOf(date) {
  if (typeof date !== 'string') {
    return null;
  }

  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(date);

  return match ? match[1] : null;
}

export function groupMemoriesByYear(memories) {
  if (!Array.isArray(memories)) {
    return [];
  }

  const groups = [];
  let current = null;

  for (const memory of memories) {
    const year = yearOf(memory?.date);

    /* A record whose date is unusable is still a memory someone made, so it is kept rather
       than dropped. It groups under its own heading at the end of whatever run it is in. */
    const label = year ?? 'Undated';

    if (current === null || current.year !== label) {
      current = { year: label, memories: [] };
      groups.push(current);
    }

    current.memories.push(memory);
  }

  return groups;
}
