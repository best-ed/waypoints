export const STORAGE_KEY = 'waypoints:v1';
export const STORAGE_VERSION = 1;
export const CORRUPT_KEY_PREFIX = 'waypoints:v1:corrupt-';

export const TITLE_MIN_LENGTH = 1;
export const TITLE_MAX_LENGTH = 120;
export const NOTE_MAX_LENGTH = 5000;
export const PLACE_NAME_MAX_LENGTH = 200;

export const MAX_TAGS = 10;
export const TAG_MAX_LENGTH = 30;

export const LAT_MIN = -90;
export const LAT_MAX = 90;
export const LNG_MIN = -180;
export const LNG_MAX = 180;

/* Six decimals is roughly 0.1m at the equator - finer than any consumer GPS fix. */
export const COORDINATE_DECIMALS = 6;

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const MEMORY_FIELDS = [
  'id',
  'title',
  'note',
  'date',
  'lat',
  'lng',
  'placeName',
  'tags',
  'photoIds',
  'createdAt',
  'updatedAt'
];
