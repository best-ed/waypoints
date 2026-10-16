/* ?memory=<id> is which memory's detail view is open. It sits beside the filter params
   because it is the same kind of thing: a piece of state the URL should carry so a view can
   be bookmarked, shared or reopened. It is not a filter, so it lives in its own module and
   the filter serializer never sees it.

   Unlike the filters this one does push a history entry, because opening a memory is
   navigation: Back should close it. The rules are in CLAUDE.md. */

export const MEMORY_PARAM = 'memory';

/* An id is any non-empty string as far as the store is concerned, since restore and import
   keep the ids they are given. So there is nothing to pattern match: the only real check is
   whether the store has it, and main.js drops an id it cannot find. The cap is here so a URL
   edited by hand cannot make us carry a megabyte of junk through every filter rewrite. */
const MAX_LENGTH = 200;

export function parseMemoryId(search) {
  const raw = new URLSearchParams(search ?? '').get(MEMORY_PARAM);

  if (typeof raw !== 'string') {
    return null;
  }

  const id = raw.trim();

  return id === '' || id.length > MAX_LENGTH ? null : id;
}

/* Returns a new URLSearchParams rather than mutating the filters' own, so a caller holding
   the serialized filters is not surprised by an extra key appearing in it. Appended last,
   which keeps an unfiltered detail view at the short ?memory=<id> rather than burying the
   id behind empty filter keys. */
export function withMemoryId(params, id) {
  const next = new URLSearchParams(params ?? '');
  next.delete(MEMORY_PARAM);

  if (typeof id === 'string' && id.trim() !== '') {
    next.set(MEMORY_PARAM, id.trim());
  }

  return next;
}
