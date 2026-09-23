import { COORDINATE_DECIMALS } from './schema.js';

function trimString(value) {
  return typeof value === 'string' ? value.trim() : value;
}

/* Form inputs arrive as strings, so numeric-looking text is parsed here rather than
   forcing every caller to convert. Anything that isn't a finite number is passed
   through untouched for validateMemory to report. */
function toFiniteNumber(value) {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
}

export function roundCoordinate(value) {
  const numeric = toFiniteNumber(value);
  if (typeof numeric !== 'number' || !Number.isFinite(numeric)) {
    return numeric;
  }
  const rounded = Number(numeric.toFixed(COORDINATE_DECIMALS));
  return rounded === 0 ? 0 : rounded;
}

export function normalizeTags(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set();
  const tags = [];
  for (const entry of value) {
    if (typeof entry !== 'string') {
      continue;
    }
    const tag = entry.trim().toLowerCase();
    if (tag === '' || seen.has(tag)) {
      continue;
    }
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
}

function normalizePhotoIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry) => typeof entry === 'string' && entry.trim() !== '').map((entry) => entry.trim());
}

export function normalizeMemoryInput(input) {
  const source = input && typeof input === 'object' ? input : {};
  return {
    title: trimString(source.title) ?? '',
    note: trimString(source.note) ?? '',
    date: trimString(source.date) ?? '',
    lat: roundCoordinate(source.lat),
    lng: roundCoordinate(source.lng),
    placeName: trimString(source.placeName) ?? '',
    tags: normalizeTags(source.tags),
    photoIds: normalizePhotoIds(source.photoIds)
  };
}
