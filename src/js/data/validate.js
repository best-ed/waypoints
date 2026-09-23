import {
  DATE_PATTERN,
  LAT_MAX,
  LAT_MIN,
  LNG_MAX,
  LNG_MIN,
  MAX_TAGS,
  NOTE_MAX_LENGTH,
  PLACE_NAME_MAX_LENGTH,
  TAG_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  TITLE_MIN_LENGTH
} from './schema.js';

export function isRealCalendarDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1) {
    return false;
  }
  /* Round-tripping through UTC rejects overflow like 2025-02-30, which Date would
     otherwise roll forward into March. */
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function validateCoordinate(value, min, max, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return `${label} must be a number`;
  }
  if (value < min || value > max) {
    return `${label} must be between ${min} and ${max}`;
  }
  return null;
}

export function validateMemory(memory) {
  const errors = {};
  const value = memory && typeof memory === 'object' ? memory : {};

  if (typeof value.title !== 'string' || value.title.length < TITLE_MIN_LENGTH) {
    errors.title = 'Title is required';
  } else if (value.title.length > TITLE_MAX_LENGTH) {
    errors.title = `Title must be ${TITLE_MAX_LENGTH} characters or fewer`;
  }

  if (typeof value.note !== 'string') {
    errors.note = 'Note must be text';
  } else if (value.note.length > NOTE_MAX_LENGTH) {
    errors.note = `Note must be ${NOTE_MAX_LENGTH} characters or fewer`;
  }

  if (typeof value.date !== 'string' || value.date === '') {
    errors.date = 'Date is required';
  } else if (!DATE_PATTERN.test(value.date)) {
    errors.date = 'Date must be formatted as YYYY-MM-DD';
  } else if (!isRealCalendarDate(value.date)) {
    errors.date = 'Date must be a real calendar date';
  }

  const latError = validateCoordinate(value.lat, LAT_MIN, LAT_MAX, 'Latitude');
  if (latError) {
    errors.lat = latError;
  }

  const lngError = validateCoordinate(value.lng, LNG_MIN, LNG_MAX, 'Longitude');
  if (lngError) {
    errors.lng = lngError;
  }

  if (typeof value.placeName !== 'string') {
    errors.placeName = 'Place name must be text';
  } else if (value.placeName.length > PLACE_NAME_MAX_LENGTH) {
    errors.placeName = `Place name must be ${PLACE_NAME_MAX_LENGTH} characters or fewer`;
  }

  if (!Array.isArray(value.tags)) {
    errors.tags = 'Tags must be a list';
  } else if (value.tags.length > MAX_TAGS) {
    errors.tags = `Use ${MAX_TAGS} tags or fewer`;
  } else if (value.tags.some((tag) => tag.length > TAG_MAX_LENGTH)) {
    errors.tags = `Each tag must be ${TAG_MAX_LENGTH} characters or fewer`;
  }

  if (!Array.isArray(value.photoIds)) {
    errors.photoIds = 'Photo ids must be a list';
  } else if (value.photoIds.some((id) => typeof id !== 'string')) {
    errors.photoIds = 'Photo ids must be text';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
