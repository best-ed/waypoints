/* Moving a photo within its list, which is all that reordering is: the first entry is the
   cover, and nothing in the record says so. There is no cover field and no sort order to keep
   in step, because photoIds is already an ordered list and the schema says nothing about what
   the order means. Giving it a meaning costs nothing and a cover field would have to be
   validated, migrated and kept honest against a list it could contradict.

   Returns a new array. The caller holds the entries it is rendering from, and sorting one out
   from under it is how a keyed renderer ends up showing someone else's picture. */

export function movePhoto(list, from, to) {
  const entries = Array.isArray(list) ? [...list] : [];

  if (!Number.isInteger(from) || from < 0 || from >= entries.length) {
    return entries;
  }

  /* Clamped rather than refused: "move later" on the last photo and "move earlier" on the
     first are things people press, and the answer is that nothing happens, not that the list
     comes back empty. */
  const target = Math.max(0, Math.min(Number.isInteger(to) ? to : from, entries.length - 1));

  if (target === from) {
    return entries;
  }

  const [moved] = entries.splice(from, 1);
  entries.splice(target, 0, moved);

  return entries;
}
