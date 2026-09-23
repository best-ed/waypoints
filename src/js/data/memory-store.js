import { normalizeMemoryInput } from './normalize.js';
import { validateMemory } from './validate.js';
import { ValidationError } from './errors.js';
import { readEnvelope, writeEnvelope } from './storage.js';

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

export function createMemoryStore({ storage, now, makeId }) {
  let memories = readEnvelope(storage, now).memories.map(cloneMemory);

  function commit(nextMemories) {
    writeEnvelope(storage, nextMemories);
    memories = nextMemories;
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

  function remove(id) {
    const index = findIndex(id);
    if (index === -1) {
      return false;
    }

    commit(memories.filter((memory) => memory.id !== id));
    return true;
  }

  return { list, get, add, update, remove };
}
