import { test as base, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

/* The shared harness. Everything here is global rather than per-test on purpose: a console
   error or a blocked resource is a failure wherever it happens, and a suite that only notices
   when a test remembers to look is a suite that stops noticing. */

const TILE = readFileSync(new URL('./fixtures/tile.png', import.meta.url));
const SEARCH = readFileSync(new URL('./fixtures/nominatim-search.json', import.meta.url), 'utf8');
const REVERSE = readFileSync(new URL('./fixtures/nominatim-reverse.json', import.meta.url), 'utf8');

export const NOMINATIM = '**nominatim.openstreetmap.org**';
const TILE_HOSTS = ['**basemaps.cartocdn.com**', '**tile.openstreetmap.org**'];

export const SEARCH_RESULTS = JSON.parse(SEARCH);
export const REVERSE_RESULT = JSON.parse(REVERSE);

/* Console messages that are noise rather than a fault, each with a reason. Kept deliberately
   short: the point of failing on console errors is lost if this list grows to cover real ones. */
const IGNORED = [
  /Download the React DevTools/,
  /\[DOM\] Found 2 elements with non-unique id/
];

const isIgnored = (text) => IGNORED.some((pattern) => pattern.test(text));

export const test = base.extend({
  /* Context-level routing, not page-level: the service worker makes its own requests for tiles
     and for the CDN, and those do not pass through page.route. Without this the offline tests
     would quietly reach the real providers. */
  context: async ({ context }, use) => {
    for (const host of TILE_HOSTS) {
      await context.route(host, (route) =>
        route.fulfill({
          status: 200,
          contentType: 'image/png',
          headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' },
          body: TILE
        })
      );
    }

    await use(context);
  },

  page: async ({ page, context }, use, testInfo) => {
    const problems = [];

    page.on('console', (message) => {
      if (message.type() === 'error' && !isIgnored(message.text())) {
        problems.push('console error: ' + message.text());
      }
    });

    page.on('pageerror', (error) => {
      problems.push('page error: ' + error.message);
    });

    /* A CSP violation does log to the console, but the wording differs between engines and
       WebKit does not always report the directive. The event carries both, so it is reported
       from inside the page instead of being pattern-matched out of a log line. */
    await page.exposeFunction('__reportCsp', (detail) => {
      problems.push('CSP violation: ' + detail.directive + ' blocked ' + detail.blocked);
    });

    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (event) => {
        window.__reportCsp({
          directive: event.violatedDirective,
          blocked: event.blockedURI || '(inline)'
        });
      });
    });

    /* Nominatim is never reached. A test that needs results installs its own route, which
       Playwright matches first because it was added later; anything that gets through to this
       one is a request the suite did not intend to make. */
    await context.route(NOMINATIM, (route) => {
      problems.push('a request reached Nominatim unmocked: ' + route.request().url());
      return route.abort();
    });

    await use(page);

    /* Attached as well as asserted, so a CI failure shows what happened without a rerun. */
    if (problems.length > 0) {
      await testInfo.attach('page problems', { body: problems.join('\n'), contentType: 'text/plain' });
    }

    expect(problems, 'the page reported problems').toEqual([]);
  }
});

export { expect };

/* ------------------------------------------------------------------ helpers */

export const BASE = '/index.html';

export function memory(id, title, date, lat, lng, tags = [], extra = {}) {
  return {
    id,
    title,
    note: extra.note ?? '',
    date,
    lat,
    lng,
    placeName: extra.placeName ?? '',
    tags,
    photoIds: extra.photoIds ?? [],
    createdAt: extra.createdAt ?? date + 'T00:00:00.000Z',
    updatedAt: extra.updatedAt ?? date + 'T00:00:00.000Z'
  };
}

export const LIBRARY = [
  memory('m1', 'Karura forest walk', '2023-03-12', -1.2359, 36.8137, ['trail', 'view']),
  memory('m2', 'Mombasa old town', '2023-07-04', -4.0624, 39.6682, ['food']),
  memory('m3', 'Hell Gate hike', '2024-01-20', -0.9, 36.3167, ['trail']),
  memory('m4', 'Nairobi rooftop sunset', '2024-06-15', -1.2921, 36.8219, ['view', 'food']),
  memory('m5', 'Just a plain day', '2025-04-01', -1.3, 36.85, [])
];

/* Written before anything on the page runs, so the app boots with the library already there
   rather than being clicked into existence.

   Only when nothing is stored yet. addInitScript runs on every navigation, so seeding
   unconditionally would quietly undo whatever the test had just done the moment it reloaded -
   which is exactly how the photo test came to assert against a memory that no longer had one. */
export async function seedLibrary(page, memories = LIBRARY) {
  await page.addInitScript((records) => {
    if (window.localStorage.getItem('waypoints:v1') === null) {
      window.localStorage.setItem('waypoints:v1', JSON.stringify({ version: 1, memories: records }));
    }
  }, memories);
}

export async function openApp(page, search = '') {
  await page.goto(BASE + search);
  await page.waitForFunction(
    () =>
      document.querySelectorAll('.memory-list li').length > 0 ||
      document.getElementById('welcome')?.hidden === false ||
      document.getElementById('memory-empty')?.hidden === false
  );
}

/* Edit, Move and Delete live in the detail view now, so the way to any of them is through a
   memory rather than through its pin. One helper, because every spec that used to reach for
   the popup's buttons has to come this way instead. */
export async function openDetail(page, { narrow = false, index = 0 } = {}) {
  if (narrow) {
    await page.locator('#view-list').click();
  }

  await page.locator('.memory-list li button').nth(index).click();
  await expect(page.locator('#memory-detail')).toBeVisible();
}

/* A popup, which is now reached from the map rather than from the list. Seed one memory, or
   two far enough apart not to cluster: a pin under a cluster is a slow and flaky way in to
   something that is not what the test is about. */
export async function openPopup(page, { narrow = false, index = 0 } = {}) {
  if (narrow) {
    await page.locator('#view-map').click();
  }

  /* Dispatched rather than clicked at a point. Where a pin lands depends on where the map
     centred itself on whatever was seeded, and at 1280 that is often underneath the sidebar;
     a real click there is intercepted and the test fails for a reason that has nothing to do
     with what it is testing. Leaflet binds an ordinary click listener to the icon element, so
     this reaches it. */
  await page.locator('.leaflet-marker-icon').nth(index).dispatchEvent('click');
  await expect(page.locator('.leaflet-popup')).toBeVisible();
}

/* Mocks a place search. Added after the guard route in the fixture, so it wins. */
export async function mockNominatim(page, { search = SEARCH_RESULTS, reverse = REVERSE_RESULT } = {}) {
  await page.route(NOMINATIM, (route) => {
    const url = route.request().url();
    const body = url.includes('/reverse') ? reverse : search;

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(body)
    });
  });
}

/* A real JPEG, made in the page, so the photo pipeline decodes something an image decoder
   actually accepts rather than bytes claiming to be one. */
export async function generatePhotoBytes(page) {
  return page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 48;
    canvas.height = 32;
    const context = canvas.getContext('2d');
    context.fillStyle = '#c2410c';
    context.fillRect(0, 0, 48, 32);
    context.fillStyle = '#ffffff';
    context.fillRect(8, 8, 16, 16);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    const bytes = new Uint8Array(await blob.arrayBuffer());

    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  });
}
