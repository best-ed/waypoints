import {
  test,
  expect,
  openApp,
  openDetail,
  seedLibrary,
  mockNominatim,
  generatePhotoBytes,
  memory,
  LIBRARY,
  BASE
} from './fixtures.js';

/* Curated rather than exhaustive. The unit suite already covers the pure logic; these are the
   paths that only break once a real browser, real storage and the production headers are all
   involved at once. Each one seeds its own state and shares nothing. */

test('boots with an empty library and offers somewhere to start', async ({ page }) => {
  await page.goto(BASE);

  await expect(page.locator('#welcome')).toBeVisible();
  await expect(page.locator('#welcome-add')).toBeVisible();
  await expect(page.locator('#welcome-import')).toBeVisible();

  /* Everything that is an answer to a question nobody with an empty library is asking. */
  await expect(page.locator('#sidebar-controls')).toBeHidden();
  await expect(page.locator('#memory-search')).toBeHidden();
  await expect(page.locator('#filters-toggle')).toBeHidden();
  await expect(page.locator('.journey')).toBeHidden();
  await expect(page.locator('#memory-empty')).toBeHidden();

  await expect(page.locator('.memory-list li')).toHaveCount(0);
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await expect(page.locator('#add-memory')).toBeEnabled();
});

test('the first memory brings the whole sidebar back', async ({ page }) => {
  /* Placing a pin reverse geocodes it, so the response is mocked rather than the feature
     being switched off: the guard route is what caught this. */
  await mockNominatim(page);
  await page.goto(BASE);
  await expect(page.locator('#welcome')).toBeVisible();

  await page.locator('#welcome-add').click();
  const box = await page.locator('#map').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  await expect(page.locator('#memory-dialog')).toBeVisible();
  await page.locator('#memory-title').fill('The first one');
  await page.locator('#memory-date').fill('2025-05-05');
  await page.locator('#memory-save').click();

  await expect(page.locator('#welcome')).toBeHidden();
  await expect(page.locator('#sidebar-controls')).toBeVisible();
  await expect(page.locator('#memory-search')).toBeVisible();
  await expect(page.locator('.memory-list li')).toHaveCount(1);

  /* One memory is a dot, not a journey, so the control is not there to be explained. */
  await expect(page.locator('.journey')).toBeHidden();
});

test('adds a memory by placing a pin', async ({ page }) => {
  /* Suggestions off, so placing a pin sends nothing anywhere and the test does not depend on
     a reverse geocode it did not ask for. */
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'waypoints:settings',
      JSON.stringify({ suggestPlaceNames: false, theme: 'system' })
    );
  });
  await page.goto(BASE);

  await page.locator('#add-memory').click();
  const box = await page.locator('#map').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  await expect(page.locator('#memory-dialog')).toBeVisible();
  await page.locator('#memory-title').fill('A placed memory');
  await page.locator('#memory-date').fill('2025-05-05');
  await page.locator('#memory-tags').fill('trail, view');
  await page.locator('#memory-save').click();

  await expect(page.locator('#memory-dialog')).toBeHidden();
  await expect(page.locator('.memory-list li')).toHaveCount(1);
  await expect(page.locator('.memory-list li').first()).toContainText('A placed memory');

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('waypoints:v1')).memories);
  expect(stored).toHaveLength(1);
  expect(stored[0].title).toBe('A placed memory');
  expect(stored[0].tags).toEqual(['trail', 'view']);
  expect(Number.isFinite(stored[0].lat)).toBe(true);
});

test('a photo survives a reload, on whichever engine is running', async ({ page }) => {
  /* The one that guards the storage shape. WebKit's IndexedDB cannot hold a Blob, so if this
     ever regresses to storing Blobs it fails here and nowhere else. */
  await seedLibrary(page, [memory('a', 'Photo memory', '2025-01-01', -1.29, 36.82, ['x'])]);
  await openApp(page);

  const jpeg = await generatePhotoBytes(page);

  await openDetail(page);
  await page.locator('#detail-edit').click();
  await expect(page.locator('#memory-dialog')).toBeVisible();

  await page.locator('#memory-photo-input').setInputFiles({
    name: 'generated.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from(jpeg, 'base64')
  });
  await expect(page.locator('#memory-photos img')).toHaveCount(1);
  await page.locator('#memory-save').click();
  await expect(page.locator('#memory-dialog')).toBeHidden();

  const ids = await page.evaluate(
    () => JSON.parse(localStorage.getItem('waypoints:v1')).memories[0].photoIds
  );
  expect(ids).toHaveLength(1);

  /* What is actually on disk: bytes, no Blob anywhere in the record. */
  const shape = await page.evaluate(
    (id) =>
      new Promise((resolve) => {
        const request = indexedDB.open('waypoints', 1);
        request.onsuccess = () => {
          const read = request.result.transaction('photos', 'readonly').objectStore('photos').get(id);
          read.onsuccess = () =>
            resolve({
              fields: Object.keys(read.result).sort(),
              anyBlob: Object.values(read.result).some((value) => value instanceof Blob),
              bytes: read.result.bytes ? read.result.bytes.byteLength : 0
            });
        };
      }),
    ids[0]
  );

  expect(shape.anyBlob).toBe(false);
  expect(shape.fields).toContain('bytes');
  expect(shape.fields).toContain('thumbBytes');
  expect(shape.bytes).toBeGreaterThan(0);

  await openApp(page);

  /* The popup shows the thumb as a cover, and the detail view shows the photo itself. Both
     come out of the same record, so both are checked here. */
  await page.locator('.memory-list li button').first().click();
  const cover = page.locator('.popup-cover-image');
  await expect(cover).toBeVisible();
  expect(await cover.evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);

  await page.locator('.popup-open').click();
  await expect(page.locator('#memory-detail')).toBeVisible();

  const hero = page.locator('.detail-hero-button img');
  await expect(hero).toBeVisible();
  expect(await hero.evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);

  await page.locator('.detail-hero-button').click();
  await expect(page.locator('#lightbox')).toBeVisible();
  expect(await page.locator('#lightbox-image').evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
});

test('edits a memory and sees it everywhere', async ({ page }) => {
  /* One memory, so choosing it from the list does not have to expand a cluster first. The
     cluster path is covered elsewhere; here it is only a slow, flaky way in. */
  await seedLibrary(page, [memory('only', 'The only memory', '2025-03-03', -1.29, 36.82, ['x'])]);
  await openApp(page);

  await openDetail(page);
  await page.locator('#detail-edit').click();
  await page.locator('#memory-title').fill('Renamed on the way through');
  await page.locator('#memory-save').click();

  await expect(page.locator('.memory-list')).toContainText('Renamed on the way through');
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('waypoints:v1')).memories.map((m) => m.title)
  );
  expect(stored).toEqual(['Renamed on the way through']);
});

test('deletes a memory and undoes it, keeping the same record', async ({ page }) => {
  /* Two, far enough apart not to cluster, so the one being deleted can be opened directly. */
  await seedLibrary(page, [
    memory('m1', 'Karura forest walk', '2023-03-12', -1.2359, 36.8137, ['trail']),
    memory('m6', 'London South Bank', '2024-11-02', 51.5074, -0.1278, ['view'])
  ]);
  await openApp(page);

  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('waypoints:v1')).memories);

  await openDetail(page);
  await page.locator('#detail-delete').click();

  await expect(page.locator('.memory-list li')).toHaveCount(1);
  await expect(page.locator('#toast-region')).toContainText('Deleted');

  await page.locator('.toast-action').click();
  await expect(page.locator('.memory-list li')).toHaveCount(2);

  /* Restored, not re-created: same id and same timestamps. */
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('waypoints:v1')).memories);
  expect(after.map((m) => m.id).sort()).toEqual(before.map((m) => m.id).sort());
  const restored = after.find((m) => m.id === 'm1');
  const original = before.find((m) => m.id === 'm1');
  expect(restored.createdAt).toBe(original.createdAt);
  expect(restored.updatedAt).toBe(original.updatedAt);
});

test('a text filter narrows the list and comes back from the url', async ({ page }) => {
  await seedLibrary(page);
  await openApp(page);

  await page.locator('#memory-search').fill('mombasa');
  await expect(page.locator('.memory-list li')).toHaveCount(1);
  await expect(page).toHaveURL(/q=mombasa/);

  await page.goto(page.url());
  await expect(page.locator('#memory-search')).toHaveValue('mombasa');
  await expect(page.locator('.memory-list li')).toHaveCount(1);
});

test('a tag filter is a union and comes back from the url', async ({ page }) => {
  await seedLibrary(page);
  await openApp(page);

  /* The tag chips live behind the Filters disclosure, which is closed when nothing is
     filtering. Restoring from the url below needs no click: a url carrying filters opens
     the panel itself, which is the point of it doing so. */
  await page.locator('#filters-toggle').click();
  await expect(page.locator('#filters-panel')).toBeVisible();

  await page.locator('.tag-chip', { hasText: 'trail' }).click();
  await expect(page.locator('.memory-list li')).toHaveCount(2);

  await page.locator('.tag-chip', { hasText: 'food' }).click();
  /* Selecting a second tag widens the result rather than narrowing it. */
  await expect(page.locator('.memory-list li')).toHaveCount(4);
  await expect(page).toHaveURL(/tags=/);

  const restored = page.url();
  await page.goto(restored);
  await expect(page.locator('.memory-list li')).toHaveCount(4);
  /* Open on arrival, because the url said something was filtering. */
  await expect(page.locator('#filters-toggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.tag-chip[aria-pressed="true"]')).toHaveCount(2);
  /* And one removable chip per tag above it. */
  await expect(page.locator('#active-filters .chip-removable')).toHaveCount(2);
});

test('a date range filters inclusively and comes back from the url', async ({ page }) => {
  await seedLibrary(page);
  await openApp(page);

  /* Blurred after each one, because the date inputs apply on change - which is what a date
     picker fires when a date is chosen. Playwright's WebKit has no native date control and
     falls back to a text input, where change only arrives on blur; real Safari has supported
     type="date" for years, so this is the harness, not the app. */
  await page.locator('#filters-toggle').click();
  await expect(page.locator('#filters-panel')).toBeVisible();

  await page.locator('#filter-from').fill('2024-01-20');
  await page.locator('#filter-from').blur();
  await page.locator('#filter-to').fill('2024-06-15');
  await page.locator('#filter-to').blur();

  /* Both ends inclusive: the two memories on exactly those dates. */
  await expect(page.locator('.memory-list li')).toHaveCount(2);
  await expect(page).toHaveURL(/from=2024-01-20/);
  await expect(page).toHaveURL(/to=2024-06-15/);

  await page.goto(page.url());
  await expect(page.locator('#filter-from')).toHaveValue('2024-01-20');
  await expect(page.locator('.memory-list li')).toHaveCount(2);
});

test('searches for a place and adds a memory there', async ({ page }) => {
  await mockNominatim(page);
  await seedLibrary(page, []);
  await page.goto(BASE);

  await page.locator('.place-search-input').fill('nairobi');
  await page.locator('.place-search-submit').click();

  const results = page.locator('.place-search-result-button');
  await expect(results).toHaveCount(2);
  await expect(results.first()).toContainText('Nairobi');

  await results.first().click();
  await page.locator('button', { hasText: 'Add memory here' }).first().click();

  await expect(page.locator('#memory-dialog')).toBeVisible();
  await page.locator('#memory-title').fill('From a place search');
  await page.locator('#memory-date').fill('2025-02-02');
  await page.locator('#memory-save').click();

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('waypoints:v1')).memories);
  expect(stored).toHaveLength(1);
  /* The coordinates came from the search result, not from the middle of the map. */
  expect(stored[0].lat).toBeCloseTo(-1.283, 1);
  expect(stored[0].lng).toBeCloseTo(36.817, 1);
});

test('journey mode enters, plays, and leaves no timer behind on Escape', async ({ page }) => {
  await seedLibrary(page);
  await openApp(page);

  await page.locator('#journey-toggle').click();
  await expect(page.locator('#journey-controls')).toBeVisible();
  await expect(page.locator('#journey-summary')).toContainText('memories');

  await page.locator('#journey-play').click();
  await expect(page.locator('#journey-progress')).toContainText('1');

  /* Let the dwell timer fire at least once and move the playback on. */
  await expect(page.locator('#journey-progress')).toContainText('2', { timeout: 15000 });

  await page.keyboard.press('Escape');
  await expect(page.locator('#journey-controls')).toBeHidden();

  /* Captured after the exit, not before it: leaving journey mode resets the playback, so the
     readout is expected to change once. What must not happen is it changing again. */
  await page.waitForTimeout(500);
  const settled = await page.locator('#journey-progress').textContent();

  /* The leak, observed rather than counted. Counting setTimeout calls says nothing here -
     Leaflet schedules dozens and lets most of them fire - so what is asserted instead is the
     thing a leaked dwell timer would actually do: keep advancing the journey after it ended.
     The dwell is 3500ms, so this waits past two of them. */
  await page.waitForTimeout(8000);

  await expect(page.locator('#journey-controls')).toBeHidden();
  expect(await page.locator('#journey-progress').textContent()).toBe(settled);
  /* .pin-journey, not .journey-step: the latter is the class on the Previous and Next
     buttons. The pins are what must go back to being ordinary pins. */
  await expect(page.locator('.pin-journey')).toHaveCount(0);
});

test('exports a file with the shape the format specifies', async ({ page }) => {
  await seedLibrary(page);
  await openApp(page);

  await page.locator('#open-settings').click();
  await page.locator('#export-include-photos').uncheck();

  const download = page.waitForEvent('download');
  await page.locator('#export-button').click();
  const file = await download;

  expect(file.suggestedFilename()).toMatch(/^waypoints-export-\d{4}-\d{2}-\d{2}\.json$/);

  const stream = await file.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const envelope = JSON.parse(Buffer.concat(chunks).toString('utf8'));

  expect(envelope.format).toBe('waypoints-export');
  expect(envelope.version).toBe(1);
  expect(envelope.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  expect(envelope.memories).toHaveLength(5);
  expect(envelope.photos).toEqual([]);

  /* Exactly the documented fields, nothing hung off a record in memory. */
  expect(Object.keys(envelope.memories[0]).sort()).toEqual(
    ['createdAt', 'date', 'id', 'lat', 'lng', 'note', 'photoIds', 'placeName', 'tags', 'title', 'updatedAt']
  );
});

test('imports a file it just exported, changing nothing', async ({ page }) => {
  await seedLibrary(page);
  await openApp(page);

  const envelope = {
    format: 'waypoints-export',
    version: 1,
    exportedAt: '2026-01-01T00:00:00.000Z',
    memories: [
      ...LIBRARY,
      memory('m9', 'Only in the file', '2025-09-09', -1.1, 36.9, ['new'])
    ],
    photos: []
  };

  await page.locator('#open-settings').click();
  await page.locator('#import-input').setInputFiles({
    name: 'round-trip.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(envelope))
  });

  await expect(page.locator('#import-dialog')).toBeVisible();
  await expect(page.locator('#import-summary')).toContainText('6 memories');

  await page.locator('#import-confirm').click();

  /* Five were already here and are left exactly as they are; one is new. */
  await expect(page.locator('.memory-list li')).toHaveCount(6);
  await expect(page.locator('.memory-list')).toContainText('Only in the file');

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('waypoints:v1')).memories);
  expect(stored).toHaveLength(6);
  expect(stored.filter((m) => m.id === 'm1')).toHaveLength(1);
});

test('a hostile import file pollutes nothing and raises no dialog', async ({ page }) => {
  await seedLibrary(page);
  await openApp(page);

  /* If anything ever called alert(), this would hang the test rather than pass it quietly. */
  let dialogs = 0;
  page.on('dialog', async (dialog) => {
    dialogs += 1;
    await dialog.dismiss();
  });

  const hostile = JSON.stringify({
    format: 'waypoints-export',
    version: 1,
    exportedAt: '2026-01-01T00:00:00.000Z',
    memories: [
      {
        id: 'evil',
        title: '<img src=x onerror=alert(1)>',
        note: '</script><script>alert(2)</script>',
        date: '2025-01-01',
        lat: -1.2,
        lng: 36.8,
        placeName: '',
        tags: ['ok'],
        photoIds: [],
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        __proto__: { polluted: 'yes' },
        constructor: { prototype: { polluted: 'yes' } }
      },
      { id: 'broken', title: '', date: 'not-a-date', lat: 999, lng: 0, tags: [null] }
    ],
    photos: []
  });

  await page.locator('#open-settings').click();
  await page.locator('#import-input').setInputFiles({
    name: 'hostile.json',
    mimeType: 'application/json',
    buffer: Buffer.from(hostile)
  });

  await expect(page.locator('#import-dialog')).toBeVisible();
  /* The broken record is reported rather than silently dropped or fatal. */
  await expect(page.locator('#import-skipped')).toBeVisible();

  await page.locator('#import-confirm').click();
  await expect(page.locator('.memory-list')).toContainText('<img src=x onerror=alert(1)>');

  const state = await page.evaluate(() => ({
    polluted: {}.polluted,
    objectPolluted: Object.prototype.polluted,
    /* The title must be text, not markup. Every card carries a cover image of its own now,
       so the count is of images the list did not put there itself. */
    injected: [...document.querySelectorAll('.memory-list img')].filter(
      (image) => !image.classList.contains('memory-cover-image')
    ).length,
    scripts: document.querySelectorAll('.memory-list script').length
  }));

  expect(state.polluted).toBeUndefined();
  expect(state.objectPolluted).toBeUndefined();
  expect(state.injected).toBe(0);
  expect(state.scripts).toBe(0);
  expect(dialogs).toBe(0);
});

test('a card shows its photo, and the list does not hoard object URLs', async ({ page }) => {
  /* The list is the one surface with no single moment when every URL it made is finished
     with, so it has an owner that releases on exit and caps what it holds. This is the
     guarantee that matters: scrolling a long list cannot grow without limit. */
  await page.addInitScript(() => {
    window.__live = 0;
    window.__peak = 0;
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      window.__live += 1;
      if (window.__live > window.__peak) window.__peak = window.__live;
      return create(blob);
    };
    URL.revokeObjectURL = (url) => {
      window.__live -= 1;
      return revoke(url);
    };
  });

  await seedLibrary(page, [memory('a', 'Has a photo', '2025-01-01', -1.29, 36.82, ['x'])]);
  await openApp(page);

  const jpeg = await generatePhotoBytes(page);
  await openDetail(page);
  await page.locator('#detail-edit').click();
  await page.locator('#memory-photo-input').setInputFiles({
    name: 'generated.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from(jpeg, 'base64')
  });
  await expect(page.locator('#memory-photos img')).toHaveCount(1);
  await page.locator('#memory-save').click();
  await expect(page.locator('#memory-dialog')).toBeHidden();

  /* Back to the list, which is where a card is. While the detail view is open the list is
     display:none, so its observer never fires and no row ever asks for its cover: hidden
     rows not loading pictures is the lazy loading working, not the cover failing. */
  await page.locator('#detail-back').click();
  await expect(page.locator('#memory-detail')).toBeHidden();

  /* The card picks the cover up without a reload. */
  const cover = page.locator('.memory-cover-image').first();
  await expect(cover).toBeVisible();
  await expect(cover).toHaveAttribute('src', /^blob:/);

  /* A memory with no photos keeps its placeholder rather than a broken image. */
  const stats = await page.evaluate(() => ({ live: window.__live, peak: window.__peak }));
  expect(stats.peak).toBeLessThan(20);
  expect(stats.live).toBeLessThanOrEqual(stats.peak);
});

test('the year headings group the list and stick to the top', async ({ page }) => {
  await seedLibrary(page);
  await openApp(page);

  /* The seeded library spans 2023 to 2025, newest first. */
  const years = await page.locator('.memory-list .year-heading').allTextContents();

  expect(years.length).toBeGreaterThan(1);
  expect(years).toEqual([...years].sort().reverse());

  /* Every card is an li inside a list, not a loose li in a div. */
  const stray = await page.evaluate(
    () => [...document.querySelectorAll('.memory-list li')].filter((li) => li.parentElement.tagName !== 'UL').length
  );
  expect(stray).toBe(0);

  const position = await page.evaluate(
    () => getComputedStyle(document.querySelector('.year-heading')).position
  );
  expect(position).toBe('sticky');
});

test('the placement hint appears while placing and leaves with the mode', async ({ page }) => {
  await mockNominatim(page);
  await seedLibrary(page);
  await openApp(page);

  const hint = page.locator('#placement-hint');
  await expect(hint).toBeHidden();

  await page.locator('#add-memory').click();
  await expect(hint).toBeVisible();
  await expect(hint).toContainText('where it happened');

  await page.keyboard.press('Escape');
  await expect(hint).toBeHidden();
});

test('an explicit theme is applied before the first paint', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'waypoints:settings',
      JSON.stringify({ suggestPlaceNames: true, theme: 'dark' })
    );
  });

  /* Read at the earliest point a document exists, which is before the stylesheets have had a
     chance to paint anything: the boot script is classic and in the head for this reason. */
  await page.goto(BASE);
  const attribute = await page.evaluate(() => document.documentElement.dataset.theme);
  expect(attribute).toBe('dark');

  const background = await page.evaluate(() =>
    getComputedStyle(document.body).backgroundColor
  );
  /* The dark surface, not the light one. */
  expect(background).not.toBe('rgb(247, 247, 245)');
});

test('system theme sets no attribute at all', async ({ page }) => {
  /* "system" is the absence of the attribute; data-theme="system" would match neither
     selector and quietly do nothing. */
  await seedLibrary(page);
  await openApp(page);

  expect(await page.evaluate(() => document.documentElement.hasAttribute('data-theme'))).toBe(false);
});
