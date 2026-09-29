/* NFD splits an accented character into its base letter plus a combining mark, so
   removing the marks leaves "Nairobi" matching "Nairóbi" either way round. */
const COMBINING_MARKS = /[̀-ͯ]/g;
const WHITESPACE = /\s+/g;

export function normalizeText(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(WHITESPACE, ' ')
    .trim();
}

export function parseQuery(query) {
  const normalized = normalizeText(query);
  return normalized === '' ? [] : normalized.split(' ');
}

/* One haystack per memory rather than per field: a term may match in any field, so the
   searchable text is joined once and every term tested against it. */
function searchableText(memory) {
  const parts = [memory?.title, memory?.note, memory?.placeName];

  if (Array.isArray(memory?.tags)) {
    parts.push(memory.tags.join(' '));
  }

  return normalizeText(parts.filter((part) => typeof part === 'string').join(' '));
}

/* Terms are ANDed: "rift valley" matches only a memory containing both words, though
   they may come from different fields. */
export function matchesQuery(memory, query) {
  const terms = parseQuery(query);
  if (terms.length === 0) {
    return true;
  }

  const haystack = searchableText(memory);
  return terms.every((term) => haystack.includes(term));
}
