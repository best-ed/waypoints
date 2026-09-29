import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createNominatimClient, PlaceSearchError } from '../../src/js/geo/nominatim-client.js';
import { createRequestScheduler, MIN_INTERVAL_MS, RequestTimeoutError } from '../../src/js/geo/request-scheduler.js';
import { createFakeClock } from '../helpers/fake-clock.js';
import { searchNairobi, reverseRoad } from '../helpers/nominatim-fixtures.js';

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

function setup({ respond, isOnline = () => true, language = 'en-GB' } = {}) {
  const clock = createFakeClock();
  const calls = [];

  const fetchImpl = async (url, options) => {
    calls.push({ url, options, at: clock.now() });
    return respond ? respond(url, options) : jsonResponse(searchNairobi);
  };

  const scheduler = createRequestScheduler({
    fetch: fetchImpl,
    now: clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout
  });

  const client = createNominatimClient({ scheduler, language, isOnline });

  return { clock, calls, client };
}

async function settle(clock, promise) {
  await clock.advance(MIN_INTERVAL_MS);
  return promise;
}

test('searches and returns parsed results', async () => {
  const { client, clock } = setup();

  const results = await settle(clock, client.search('nairobi'));

  assert.equal(results.length, 2);
  assert.equal(results[0].name, 'Nairobi');
  assert.equal(results[0].lat, -1.2832533);
});

test('builds a jsonv2 search URL with the result limit', async () => {
  const { client, clock, calls } = setup();

  await settle(clock, client.search('nairobi'));

  const url = new URL(calls[0].url);
  assert.equal(url.origin + url.pathname, 'https://nominatim.openstreetmap.org/search');
  assert.equal(url.searchParams.get('format'), 'jsonv2');
  assert.equal(url.searchParams.get('q'), 'nairobi');
  assert.equal(url.searchParams.get('limit'), '5');
});

test('sends the Accept-Language header', async () => {
  const { client, clock, calls } = setup({ language: 'sw-KE' });

  await settle(clock, client.search('nairobi'));

  assert.equal(calls[0].options.headers['Accept-Language'], 'sw-KE');
});

/* Caching is part of the usage policy, not an optimisation: a repeated query must not
   produce a second request. */
test('serves a repeated query from the cache', async () => {
  const { client, clock, calls } = setup();

  await settle(clock, client.search('nairobi'));
  assert.equal(calls.length, 1);

  const again = await client.search('nairobi');
  assert.equal(calls.length, 1, 'no second request');
  assert.equal(again.length, 2);
});

test('treats queries differing only by case or spacing as the same', async () => {
  const { client, clock, calls } = setup();

  await settle(clock, client.search('Nairobi'));
  await client.search('  nairobi  ');
  await client.search('NAIROBI');

  assert.equal(calls.length, 1);
  assert.equal(client.isCached('nairobi'), true);
});

test('does not request anything for an empty query', async () => {
  const { client, calls } = setup();

  assert.deepEqual(await client.search(''), []);
  assert.deepEqual(await client.search('   '), []);
  assert.equal(calls.length, 0);
});

test('reverse geocodes to a short place name', async () => {
  const { client, clock } = setup({ respond: () => jsonResponse(reverseRoad) });

  const name = await settle(clock, client.reverse(-1.2921, 36.8219));

  assert.equal(name, 'Kenyatta Avenue, Central Business District');
});

test('builds a jsonv2 reverse URL', async () => {
  const { client, clock, calls } = setup({ respond: () => jsonResponse(reverseRoad) });

  await settle(clock, client.reverse(-1.2921, 36.8219));

  const url = new URL(calls[0].url);
  assert.equal(url.origin + url.pathname, 'https://nominatim.openstreetmap.org/reverse');
  assert.equal(url.searchParams.get('format'), 'jsonv2');
  assert.equal(url.searchParams.get('lat'), '-1.2921');
  assert.equal(url.searchParams.get('lon'), '36.8219');
});

/* Two pins a metre apart describe the same place, so they share a cache entry. */
test('caches reverse lookups by rounded coordinates', async () => {
  const { client, clock, calls } = setup({ respond: () => jsonResponse(reverseRoad) });

  await settle(clock, client.reverse(-1.2921, 36.8219));
  await client.reverse(-1.29210001, 36.82190001);

  assert.equal(calls.length, 1);
});

test('treats clearly different coordinates as different lookups', async () => {
  const { client, clock, calls } = setup({ respond: () => jsonResponse(reverseRoad) });

  await settle(clock, client.reverse(-1.2921, 36.8219));
  await settle(clock, client.reverse(-1.3921, 36.9219));

  assert.equal(calls.length, 2);
});

test('maps a rate limit to a clear message', async () => {
  const { client, clock } = setup({ respond: () => jsonResponse(null, { ok: false, status: 429 }) });

  await assert.rejects(settle(clock, client.search('nairobi')), (error) => {
    assert.ok(error instanceof PlaceSearchError);
    assert.equal(error.kind, 'rateLimited');
    assert.match(error.message, /Too many searches/);
    return true;
  });
});

test('maps a server error to a clear message', async () => {
  for (const status of [500, 502, 503]) {
    const { client, clock } = setup({ respond: () => jsonResponse(null, { ok: false, status }) });

    await assert.rejects(settle(clock, client.search('nairobi')), (error) => {
      assert.equal(error.kind, 'server');
      return true;
    });
  }
});

test('maps a failed request while offline to an offline message', async () => {
  const { client, clock } = setup({
    respond: () => Promise.reject(new TypeError('Failed to fetch')),
    isOnline: () => false
  });

  await assert.rejects(settle(clock, client.search('nairobi')), (error) => {
    assert.equal(error.kind, 'offline');
    assert.match(error.message, /No connection/);
    return true;
  });
});

test('maps a failed request while online to a generic message', async () => {
  const { client, clock } = setup({
    respond: () => Promise.reject(new TypeError('Failed to fetch')),
    isOnline: () => true
  });

  await assert.rejects(settle(clock, client.search('nairobi')), (error) => {
    assert.equal(error.kind, 'unknown');
    return true;
  });
});

test('maps a timeout to a timeout message', async () => {
  const { client, clock } = setup({
    respond: (url, options) =>
      new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
      })
  });

  const request = client.search('nairobi');
  await clock.flush();
  await clock.advance(8000);

  await assert.rejects(request, (error) => {
    assert.ok(error instanceof PlaceSearchError);
    assert.equal(error.kind, 'timeout');
    assert.ok(error.cause instanceof RequestTimeoutError);
    return true;
  });
});

test('does not cache a failed search', async () => {
  let attempt = 0;
  const { client, clock, calls } = setup({
    respond: () => {
      attempt++;
      return attempt === 1
        ? jsonResponse(null, { ok: false, status: 500 })
        : jsonResponse(searchNairobi);
    }
  });

  await assert.rejects(settle(clock, client.search('nairobi')));

  const results = await settle(clock, client.search('nairobi'));

  assert.equal(calls.length, 2, 'the failure was retried, not cached');
  assert.equal(results.length, 2);
});

test('keeps the spacing between two different searches', async () => {
  const { client, clock, calls } = setup();

  await settle(clock, client.search('nairobi'));
  await settle(clock, client.search('mombasa'));

  assert.equal(calls.length, 2);
  assert.ok(calls[1].at - calls[0].at >= MIN_INTERVAL_MS);
});
