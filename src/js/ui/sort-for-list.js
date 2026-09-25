function descending(a, b) {
  if (a === b) {
    return 0;
  }
  return a < b ? 1 : -1;
}

/* The store lists oldest first for the map; the sidebar wants the newest at the top.
   Returns a new array - the store hands out copies, but sorting an argument in place
   would still surprise any caller that kept a reference to it. */
export function sortForList(memories) {
  return [...memories].sort((a, b) => {
    const byDate = descending(a.date, b.date);
    return byDate === 0 ? descending(a.createdAt, b.createdAt) : byDate;
  });
}
