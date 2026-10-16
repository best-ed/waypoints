/* Previous and Next in the detail view step through the list as it currently stands, which
   means the filtered set in the sidebar's own order, newest first. Not the store's order,
   which is the opposite, and not the whole library: stepping out of the filtered set would
   land on a memory the list in the background does not even show.

   Pure, and takes the ids rather than the memories, because the order is the list's and the
   list already has it. Null at either end rather than wrapping around: a journey has two
   ends, and arriving back at the start from the last stop is disorienting. */

export function findNeighbours(ids, id) {
  const index = Array.isArray(ids) ? ids.indexOf(id) : -1;

  if (index === -1) {
    return { index: -1, previous: null, next: null };
  }

  return {
    index,
    previous: index > 0 ? ids[index - 1] : null,
    next: index < ids.length - 1 ? ids[index + 1] : null
  };
}
