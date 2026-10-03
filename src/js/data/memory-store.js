import { normalizeMemoryInput } from './normalize.js';
import { validateMemory, validateStoredMemory } from './validate.js';
import { ValidationError } from './errors.js';
import { DEFAULT_NAMES, readEnvelope, writeEnvelope } from './storage.js';

function cloneMemory(memory) {
  return { ...memory, tags: [...memory.tags], photoIds: [...memory.photoIds] };
}

/* Same day is a common case once memories are added from one outing, so createdAt
   breaks the tie and keeps list order stable across reloads. */
function byDateThenCreated(a, b) {
  if (a.date !== b.date) {
    return a.date < b.date ? -1 : 1;
  }
  if (a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt ? -1 : 1;
  }
  return 0;
}

function definedEntriesOf(changes) {
  const source = changes && typeof changes === 'object' ? changes : {};
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined));
}

/* Rethrowing out of band keeps a broken listener visible in the browser console
   without unwinding a mutation that has already been written. Callers that need to
   observe the failure instead (tests, error reporting) pass their own handler. */
function rethrowAsync(error) {
  queueMicrotask(() => {
    throw error;
  });
}

export function createMemoryStore({
  storage,
  now,
  makeId,
  onListenerError = rethrowAsync,
  names = DEFAULT_NAMES
}) {
  let memories = readEnvelope(storage, now, names).memories.map(cloneMemory);
  const listeners = new Set();

  function notify() {
    const snapshot = list();
    for (const listener of [...listeners]) {
      try {
        listener(snapshot);
      } catch (error) {
        onListenerError(error);
      }
    }
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('subscribe expects a function');
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  /* Writes first: if storage rejects the change, in-memory state and listeners are
     left exactly as they were. */
  function commit(nextMemories) {
    writeEnvelope(storage, nextMemories, names);
    memories = nextMemories;
    notify();
  }

  function findIndex(id) {
    return memories.findIndex((memory) => memory.id === id);
  }

  function list() {
    return [...memories].sort(byDateThenCreated).map(cloneMemory);
  }

  function get(id) {
    const found = memories.find((memory) => memory.id === id);
    return found ? cloneMemory(found) : null;
  }

  function add(input) {
    const normalized = normalizeMemoryInput(input);
    const { valid, errors } = validateMemory(normalized);
    if (!valid) {
      throw new ValidationError(errors);
    }

    const timestamp = now().toISOString();
    const memory = {
      id: makeId(),
      ...normalized,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    commit([...memories, memory]);
    return cloneMemory(memory);
  }

  function update(id, changes) {
    const index = findIndex(id);
    if (index === -1) {
      throw new Error('No memory with id ' + id);
    }

    const existing = memories[index];
    const normalized = normalizeMemoryInput({ ...existing, ...definedEntriesOf(changes) });
    const { valid, errors } = validateMemory(normalized);
    if (!valid) {
      throw new ValidationError(errors);
    }

    const updated = {
      id: existing.id,
      ...normalized,
      createdAt: existing.createdAt,
      updatedAt: now().toISOString()
    };

    const nextMemories = [...memories];
    nextMemories[index] = updated;
    commit(nextMemories);
    return cloneMemory(updated);
  }

  /* Takes a whole record rather than an input patch: an undone delete has to come back
     with the same id and timestamps it had, or it is a different memory. */
  function restore(memory) {
    const { valid, errors } = validateStoredMemory(memory);
    if (!valid) {
      throw new ValidationError(errors);
    }

    if (findIndex(memory.id) !== -1) {
      throw new Error('A memory with id ' + memory.id + ' already exists');
    }

    const restored = {
      id: memory.id,
      ...normalizeMemoryInput(memory),
      createdAt: memory.createdAt,
      updatedAt: memory.updatedAt
    };

    commit([...memories, restored]);
    return cloneMemory(restored);
  }

  function remove(id) {
    const index = findIndex(id);
    if (index === -1) {
      return false;
    }

    commit(memories.filter((memory) => memory.id !== id));
    return true;
  }

  /* Brings a whole set of records in at once, for import.

     Everything is validated before anything is applied, so one bad record cannot leave half a
     file merged. The importer has already filtered its records, which makes this a backstop
     rather than the first line of defence.

     The merge rule is by updatedAt: an unknown id is added, a known one is replaced only if
     the incoming record is newer, and anything else is left exactly as it is. There is
     deliberately no mode that replaces the collection wholesale.

     One envelope write and one notification, whatever the size of the set. A merge that
     changes nothing writes nothing and notifies nobody, since a re-render would be pure churn.

     A repeated id inside one call keeps the first, mirroring the importer. */
  function merge(records) {
    const incoming = Array.isArray(records) ? records : [];

    for (const record of incoming) {
      const { valid, errors } = validateStoredMemory(record);
      if (!valid) {
        throw new ValidationError(errors);
      }
    }

    const existingById = new Map(memories.map((memory) => [memory.id, memory]));
    const merged = new Map(existingById);
    const applied = new Set();

    let added = 0;
    let updated = 0;
    let unchanged = 0;

    for (const record of incoming) {
      if (applied.has(record.id)) {
        continue;
      }
      applied.add(record.id);

      const existing = existingById.get(record.id);

      /* Normalized on the way in, exactly as restore does, so a hand-edited file cannot put an
         untrimmed title or an unrounded coordinate into the store. */
      const normalized = {
        id: record.id,
        ...normalizeMemoryInput(record),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt
      };

      if (!existing) {
        merged.set(record.id, normalized);
        added += 1;
      } else if (record.updatedAt > existing.updatedAt) {
        merged.set(record.id, normalized);
        updated += 1;
      } else {
        unchanged += 1;
      }
    }

    if (added > 0 || updated > 0) {
      commit([...merged.values()]);
    }

    return { added, updated, unchanged };
  }

  return { list, get, add, update, remove, restore, merge, subscribe };
}
