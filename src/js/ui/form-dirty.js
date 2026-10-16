import { normalizeMemoryInput } from '../data/normalize.js';

/* Whether the form holds anything the reader would mind losing.

   Compared through the same normalizer the store uses, so the answer matches what would
   actually be saved rather than what happens to be in the inputs. Typing a space into the
   title and taking it out again is not a change; neither is writing "Trail" over "trail",
   because tags are lowercased on the way in and both would store the same thing. Asking
   "discard your changes?" over a difference that would never reach the record is a worse
   failure than not asking at all: it teaches people to dismiss the question.

   The photos are compared as an ordered list, so a reorder is a change, and so is adding or
   removing one. They are the only field here the normalizer cannot settle on its own: a
   pending photo has an id before it is written, which is exactly what makes the comparison
   work. */

const FIELDS = ['title', 'date', 'note', 'placeName'];

function settle(values) {
  return normalizeMemoryInput(values ?? {});
}

export function isFormDirty(initial, current) {
  const was = settle(initial);
  const now = settle(current);

  for (const field of FIELDS) {
    if (was[field] !== now[field]) {
      return true;
    }
  }

  /* Order matters for photos and not for tags: the first photo is the cover, while tags are
     a set the store sorts out for itself. */
  if (was.tags.length !== now.tags.length || was.tags.some((tag, index) => tag !== now.tags[index])) {
    return true;
  }

  return (
    was.photoIds.length !== now.photoIds.length ||
    was.photoIds.some((id, index) => id !== now.photoIds[index])
  );
}
