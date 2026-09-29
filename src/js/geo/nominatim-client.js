import { normalizeText } from '../filters/match-memory.js';
import { toPlaceResults, shortPlaceName } from './parse-place.js';
import { RequestSupersededError, RequestTimeoutError } from './request-scheduler.js';

export const SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
export const REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
export const SEARCH_LIMIT = 5;

/* Reverse lookups are cached by coordinate, so they are rounded first: two pins a metre
   apart describe the same place and should not cost two requests. */
const CACHE_DECIMALS = 4;
const REVERSE_ZOOM = 18;

export const ERROR_MESSAGES = {
  offline: 'No connection. Place search needs the internet.',
  timeout: 'Place search took too long. Try again.',
  rateLimited: 'Too many searches just now. Wait a moment and try again.',
  server: 'The place search service is having trouble. Try again later.',
  unknown: 'Place search failed. Try again.'
};

export class PlaceSearchError extends Error {
  constructor(kind, cause = null) {
    super(ERROR_MESSAGES[kind] ?? ERROR_MESSAGES.unknown);
    this.name = 'PlaceSearchError';
    this.kind = kind;
    this.cause = cause;
  }
}

function cacheKeyForCoordinates(lat, lng) {
  return lat.toFixed(CACHE_DECIMALS) + ',' + lng.toFixed(CACHE_DECIMALS);
}

function classify(error, isOnline) {
  if (error instanceof PlaceSearchError) {
    return error;
  }
  if (error instanceof RequestTimeoutError) {
    return new PlaceSearchError('timeout', error);
  }
  /* A failed fetch with no response is indistinguishable from being offline from here,
     so the connection state decides which message is honest. */
  if (!isOnline()) {
    return new PlaceSearchError('offline', error);
  }
  return new PlaceSearchError('unknown', error);
}

function errorForStatus(status) {
  if (status === 429) {
    return new PlaceSearchError('rateLimited');
  }
  if (status >= 500) {
    return new PlaceSearchError('server');
  }
  return new PlaceSearchError('unknown');
}

export function createNominatimClient({
  scheduler,
  language = 'en',
  isOnline = () => navigator.onLine,
  searchUrl = SEARCH_URL,
  reverseUrl = REVERSE_URL
}) {
  const searchCache = new Map();
  const reverseCache = new Map();

  function buildUrl(base, params) {
    const url = new URL(base);
    url.searchParams.set('format', 'jsonv2');
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  async function requestJson(url, options) {
    const response = await scheduler.run(url, {
      ...options,
      headers: { Accept: 'application/json', 'Accept-Language': language }
    });

    if (!response.ok) {
      throw errorForStatus(response.status);
    }

    return response.json();
  }

  async function search(query, options = {}) {
    const key = normalizeText(query);
    if (key === '') {
      return [];
    }

    if (searchCache.has(key)) {
      return searchCache.get(key);
    }

    try {
      const raw = await requestJson(
        buildUrl(searchUrl, { q: query, limit: SEARCH_LIMIT, addressdetails: 1 }),
        options
      );
      const results = toPlaceResults(raw);
      searchCache.set(key, results);
      return results;
    } catch (error) {
      if (error instanceof RequestSupersededError) {
        throw error;
      }
      throw classify(error, isOnline);
    }
  }

  async function reverse(lat, lng, options = {}) {
    const key = cacheKeyForCoordinates(lat, lng);

    if (reverseCache.has(key)) {
      return reverseCache.get(key);
    }

    try {
      const raw = await requestJson(
        buildUrl(reverseUrl, { lat, lon: lng, zoom: REVERSE_ZOOM, addressdetails: 1 }),
        options
      );
      const name = shortPlaceName(raw);
      reverseCache.set(key, name);
      return name;
    } catch (error) {
      if (error instanceof RequestSupersededError) {
        throw error;
      }
      throw classify(error, isOnline);
    }
  }

  return {
    search,
    reverse,
    isCached: (query) => searchCache.has(normalizeText(query)),
    cacheSize: () => searchCache.size + reverseCache.size
  };
}
