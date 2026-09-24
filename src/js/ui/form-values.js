const TAG_SEPARATOR = ',';

function padTwo(value) {
  return String(value).padStart(2, '0');
}

/* Built from the local getters on purpose. toISOString() would give the UTC date, which
   in UTC+3 is the previous day between midnight and 03:00 local. */
export function todayLocalDate(date = new Date()) {
  return [date.getFullYear(), padTwo(date.getMonth() + 1), padTwo(date.getDate())].join('-');
}

export function parseTagInput(value) {
  if (typeof value !== 'string') {
    return [];
  }
  return value
    .split(TAG_SEPARATOR)
    .map((tag) => tag.trim())
    .filter((tag) => tag !== '');
}
