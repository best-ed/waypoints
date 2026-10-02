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

  return { list, get, add, update, remove, restore, subscribe };
}
