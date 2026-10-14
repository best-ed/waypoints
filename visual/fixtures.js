import { test as base, expect } from '../e2e/fixtures.js';

/* The visual suite's own harness. It inherits the e2e one - the tile route, the Nominatim
   guard and the console-error failure all still apply - and adds everything a screenshot
   comparison needs to produce the same pixels twice.

   Five things move between runs if nothing is done about them, and all five are dealt with
   here rather than in each test:

   - the clock, because the add dialog fills in today's date and the list groups by year
   - the data, because a generated library is a different library every time
   - the fonts, because a screenshot taken before Fraunces loads is a screenshot of the system
     stack, and which one you get depends on how warm the disk cache is
   - motion, because a transition caught mid-flight is a different frame every run
   - the caret, which blinks

   The tiles are the e2e fixture tile, so the map is one image repeated and never a network
   request. */

/* A real day, fixed. Everything date-shaped in the app derives from this: the year headings,
   the date field in a new memory, and the relative wording in the journey summary. */
export const FROZEN_NOW = new Date('2026-06-15T09:00:00.000Z');

/* Sandbox storage, never the real keys. A visual run seeds a library of its own, and the one
   thing it must not be able to do is write it where somebody's memories live. */
const SANDBOX_KEY = 'waypoints:sandbox:v1';
const SANDBOX_SETTINGS_KEY = 'waypoints:sandbox:settings';

export const APP = '/index.html?sandbox';

function memory(id, title, date, lat, lng, placeName, tags, extra = {}) {
  return {
    id,
    title,
    note: extra.note ?? '',
    date,
    lat,
    lng,
    placeName,
    tags,
    photoIds: extra.photoIds ?? [],
    createdAt: date + 'T08:00:00.000Z',
    updatedAt: date + 'T08:00:00.000Z'
  };
}

/* Fixed, hand-written and small. A generator seeded with a constant would also be
   reproducible, but a list you can read is a list whose screenshot you can check by eye. */
export const LIBRARY = [
  memory('v1', 'Ridge trail at the long rains', '2025-03-04', -1.3521, 36.6412, 'Ngong Hills, Kajiado', ['trail', 'rain', 'ngong'], {
    note:
      'Walked up from the gate in the afternoon and the cloud came in about an hour later.\n\n' +
      'Three of us, one umbrella, and the last matatu back at six.',
    photoIds: ['vp1', 'vp2', 'vp3']
  }),
  memory('v2', 'Coffee at the old post office', '2024-11-18', -1.2864, 36.8172, 'Nairobi Central', ['coffee', 'city'], {
    note: 'Half an hour early, as usual.'
  }),
  memory('v3', 'Morning on the escarpment', '2024-07-09', -0.9, 36.3167, 'Hell Gate', ['trail', 'view']),
  memory('v4', 'Rooftop, late', '2024-02-21', -1.2921, 36.8219, 'Nairobi', ['view', 'food']),
  memory('v5', 'The causeway at low tide', '2023-06-02', -4.0435, 39.6682, 'Mombasa', ['coast', 'walk', 'trail'], {
    note: 'Walked out further than we should have.'
  }),
  memory('v6', 'Lake edge', '2023-01-14', -0.7167, 36.4333, 'Naivasha', ['water'])
];

export const test = base.extend({
  page: async ({ page }, use) => {
    /* Before any navigation, so the page never sees the real clock even during boot. */
    await page.clock.install({ time: FROZEN_NOW });

    await page.addInitScript(
      ([key, settingsKey, records]) => {
        window.localStorage.setItem(key, JSON.stringify({ version: 1, memories: records }));
        /* Stated rather than left to default, so a theme or a map setting cannot drift a
           baseline. The theme itself comes from emulateMedia per test. */
        window.localStorage.setItem(
          settingsKey,
          JSON.stringify({ suggestPlaceNames: false, theme: 'system', dimMapInDark: true })
        );
      },
      [SANDBOX_KEY, SANDBOX_SETTINGS_KEY, LIBRARY]
    );

    await use(page);
  }
});

/* Everything a test does between arriving and being photographed. */
export async function settle(page) {
  /* The display face is loaded from our own files, so this resolves as soon as it is parsed -
     but before it does, every heading in the app is the system stack. */
  await page.evaluate(() => document.fonts.ready);
  /* One frame, so the last layout the app asked for has actually been painted. */
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
}

export async function openApp(page, { narrow = false } = {}) {
  await page.goto(APP);
  await page.waitForFunction(
    () =>
      document.querySelectorAll('.memory-list li').length > 0 ||
      document.getElementById('welcome')?.hidden === false
  );

  if (narrow) {
    /* The app chooses a pane at boot on a narrow screen, so a test that wants one says so. */
    await page.locator('#view-map').click();
  }

  await settle(page);
}

/* The one photo these use, written straight into the sandbox database. A fixed 2x2 JPEG rather
   than a drawn one: canvas output is stable on a machine but not obviously so across builds,
   and a baseline that depends on an encoder is a baseline that moves on its own. */
export async function seedPhotos(page) {
  await page.evaluate(async (ids) => {
    const { createIndexedDbBackend } = await import('/src/js/photos/indexeddb-backend.js');
    const backend = createIndexedDbBackend({ databaseName: 'waypoints-sandbox' });

    const draw = async (index, width, height) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      /* Flat fills only. A gradient is where an encoder's choices show up. */
      context.fillStyle = ['#7c5e3b', '#2f4858', '#5c6b3f'][index % 3];
      context.fillRect(0, 0, width, height);
      context.fillStyle = '#d9c7a7';
      context.fillRect(0, Math.round(height * 0.6), width, height);
      return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    };

    for (const [index, id] of ids.entries()) {
      await backend.put({
        id,
        blob: await draw(index, 1200, 800),
        thumb: await draw(index, 320, 214),
        width: 1200,
        height: 800,
        createdAt: '2025-03-04T08:00:00.000Z'
      });
    }
  }, ['vp1', 'vp2', 'vp3']);

  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('.memory-list li').length > 0);
  await settle(page);
}

export { expect };
