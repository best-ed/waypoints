const REQUIRED_FIELDS = ['id', 'blob', 'thumb', 'width', 'height', 'createdAt'];

function assertRecord(record) {
  if (!record || typeof record !== 'object') {
    throw new TypeError('A photo record is required');
  }

  for (const field of REQUIRED_FIELDS) {
    if (record[field] === undefined || record[field] === null) {
      throw new TypeError('Photo record is missing ' + field);
    }
  }

  if (typeof record.id !== 'string' || record.id.trim() === '') {
    throw new TypeError('Photo record needs an id');
  }
}

/* The backend is injected so the same repository runs over IndexedDB in the browser and
   over a plain Map in tests. Everything above this layer only ever sees these five
   methods, never an IDB request. */
export function createPhotoRepository({ backend }) {
  async function put(record) {
    assertRecord(record);
    await backend.put(record);
    return record.id;
  }

  async function get(id) {
    const found = await backend.get(id);
    return found ?? null;
  }

  async function remove(id) {
    await backend.remove(id);
  }

  /* Best effort by design: this runs on cleanup paths where a missing or already-deleted
     id is normal and must not stop the rest being removed. */
  async function removeMany(ids) {
    const removed = [];
    if (!Array.isArray(ids)) {
      return removed;
    }

    for (const id of ids) {
      try {
        await backend.remove(id);
        removed.push(id);
      } catch {
        /* Leave it for the next startup sweep rather than failing the whole batch. */
      }
    }

    return removed;
  }

  async function listIds() {
    const ids = await backend.listIds();
    return Array.isArray(ids) ? ids : [];
  }

  return { put, get, remove, removeMany, listIds };
}
