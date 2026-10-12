import { normalizeText } from '../filters/match-memory.js';

/* What to offer under the tag input.

   Prefix matches first, then the rest of the substring matches, because someone typing "tr"
   means "trail" far more often than "country". Within each group the library's own order is
   kept, which is alphabetical by the time allTags has been through it, so the list does not
   reshuffle as another letter arrives.

   Diacritic-insensitive through the same normalizeText the search uses. A tag typed as
   "nairobi" has to find one saved as "nairóbi", or the library quietly grows two of them. */

export const MAX_SUGGESTIONS = 8;

export function suggestTags(input, allTags, selected = [], { limit = MAX_SUGGESTIONS } = {}) {
  const tags = Array.isArray(allTags) ? allTags : [];
  const taken = new Set((Array.isArray(selected) ? selected : []).map(normalizeText));

  const available = tags.filter(
    (tag) => typeof tag === 'string' && tag !== '' && !taken.has(normalizeText(tag))
  );

  const query = normalizeText(input);

  /* An empty input offers what is already in the library rather than nothing. The first thing
     anyone wants from a tag field is to be reminded what they have been calling things. */
  if (query === '') {
    return available.slice(0, limit);
  }

  const prefix = [];
  const substring = [];

  for (const tag of available) {
    const normalized = normalizeText(tag);

    if (normalized.startsWith(query)) {
      prefix.push(tag);
    } else if (normalized.includes(query)) {
      substring.push(tag);
    }
  }

  return [...prefix, ...substring].slice(0, limit);
}
