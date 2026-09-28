/* Stands in for the IndexedDB adapter. Async on purpose, so the repository is exercised
   through the same await points it will hit in the browser. */
export function createFakePhotoBackend(initial = []) {
  const records = new Map(initial.map((record) => [record.id, record]));
  let failure = null;

  return {
    records,

    async put(record) {
      if (failure) {
        throw failure;
      }
      records.set(record.id, record);
    },

    async get(id) {
      if (failure) {
        throw failure;
      }
      return records.get(id);
    },

    async remove(id) {
      if (failure) {
        throw failure;
      }
      records.delete(id);
    },

    async listIds() {
      if (failure) {
        throw failure;
      }
      return [...records.keys()];
    },

    failWith(error) {
      failure = error;
    },

    stopFailing() {
      failure = null;
    }
  };
}

export function photoRecord(id, overrides = {}) {
  return {
    id,
    blob: { size: 120000, type: 'image/jpeg' },
    thumb: { size: 8000, type: 'image/jpeg' },
    width: 1600,
    height: 1200,
    createdAt: '2025-05-01T10:00:00.000Z',
    ...overrides
  };
}
