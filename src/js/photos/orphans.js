/* A photo is orphaned once no memory references it. That happens after a delete whose
   undo window closed, and after any interrupted write, so the sweep runs at startup. */
export function computeOrphans(storedIds, memories) {
  if (!Array.isArray(storedIds)) {
    return [];
  }

  const referenced = new Set();
  for (const memory of Array.isArray(memories) ? memories : []) {
    if (!Array.isArray(memory?.photoIds)) {
      continue;
    }
    for (const id of memory.photoIds) {
      referenced.add(id);
    }
  }

  return storedIds.filter((id) => !referenced.has(id));
}
