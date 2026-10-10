import {
  test,
  expect,
  openApp,
  openDetail,
  openPopup,
  seedLibrary,
  generatePhotoBytes,
  memory,
  BASE
} from './fixtures.js';

/* The detail view, and the history rules underneath it. These are the paths that only break
   once a real browser, real storage and a real session history are all involved at once: the
   unit suite has the pure parts, and none of it can tell you what Back does. */

/* The seeded library, newest first: m5 2025, m4 2024-06, m3 2024-01, m2 2023-07, m1 2023-03. */
const NEWEST = 'Just a plain day';
const SECOND = 'Nairobi rooftop sunset';
const OLDEST = 'Karura forest walk';

test('a card opens the memory, and Back returns focus to the card', async ({ page }) => {
  await seedLibrary(page);
  await openApp(page);

  await page.locator('.memory-list li button').first().click();
  await expect(page.locator('#memory-detail')).toBeVisible();
  await expect(page.locator('#detail-title')).toHaveText(NEWEST);

  /* Focus is moved deliberately, because the browser would otherwise leave it on the card
     while the list it is in goes display:none. */
  expect(await page.evaluate(() => document.activeElement.id)).toBe('detail-title');

  /* The list is not unmounted, only hidden, so coming back finds it exactly as it was. */
  await expect(page.locator('.memory-list')).toBeHidden();

  await page.locator('#detail-back').click();
  await expect(page.locator('#memory-detail')).toBeHidden();
  await expect(page.locator('.memory-list')).toBeVisible();

  const focused = await page.evaluate(() => ({
    className: document.activeElement.className,
    text: document.activeElement.textContent
  }));
  expect(focused.className).toContain('memory-button');
  expect(focused.text).toContain(NEWEST);
});

test('the detail view shows the whole memory, and the popup only previews it', async ({ page }) => {
  await seedLibrary(page, [
    memory('only', 'The ridge at the long rains', '2025-03-04', -1.35, 36.64, ['trail', 'rain'], {
      note: 'Walked up from the gate.\nThe cloud came in an hour later.',
      placeName: 'Ngong Hills'
    })
  ]);
  await openApp(page);

  /* The popup is a preview: a title, one line of date and place, and a way in. */
  await openPopup(page);
  await expect(page.locator('.popup-title')).toHaveText('The ridge at the long rains');
  await expect(page.locator('.popup-meta')).toContainText('Ngong Hills');
  await expect(page.locator('.popup')).not.toContainText('Walked up from the gate');
  await expect(page.locator('.popup .chip-tag')).toHaveCount(0);

  await page.locator('.popup-open').click();
  await expect(page.locator('#memory-detail')).toBeVisible();

  /* And the view has everything the popup used to try to hold. */
  await expect(page.locator('#detail-title')).toHaveText('The ridge at the long rains');
  await expect(page.locator('.detail-date')).toHaveText('Tuesday, 4 March 2025');
  await expect(page.locator('.detail-place')).toHaveText('Ngong Hills');
  await expect(page.locator('.detail-note')).toContainText('The cloud came in an hour later');
  await expect(page.locator('.detail-tag')).toHaveCount(2);
  await expect(page.locator('.detail-coordinates')).toContainText('-1.35, 36.64');

  /* The note keeps the writer's own line breaks without a <br> anywhere in the document. */
  expect(await page.locator('.detail-note').evaluate((node) => getComputedStyle(node).whiteSpace))
    .toBe('pre-wrap');
  expect(await page.locator('.detail-note').evaluate((node) => node.querySelector('br') !== null))
    .toBe(false);

  /* Opening a memory leaves one copy of it on screen, not two. */
  await expect(page.locator('.leaflet-popup')).toBeHidden();
});

test('a memory with no photos gets no empty frame where a photo would be', async ({ page }) => {
  await seedLibrary(page, [memory('only', 'No pictures of this one', '2025-01-01', -1.29, 36.82)]);
  await openApp(page);
  await openDetail(page);

  await expect(page.locator('.detail-hero')).toHaveCount(0);
  await expect(page.locator('.detail-thumbs')).toHaveCount(0);
  await expect(page.locator('#detail-title')).toBeVisible();
});

test('Previous and Next step through the list order and stop at both ends', async ({ page }) => {
  await seedLibrary(page);
  await openApp(page);
  await openDetail(page);

  /* The newest is first in the list, so there is nothing before it. */
  await expect(page.locator('#detail-previous')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('#detail-next')).toHaveAttribute('aria-disabled', 'false');

  /* aria-disabled, not disabled: the button is still in the tab order, so it is still
     pressable and has to answer by doing nothing. Playwright will not click one, which is
     why this is dispatched. */
  await page.locator('#detail-previous').dispatchEvent('click');
  await expect(page.locator('#detail-title')).toHaveText(NEWEST);

  await page.locator('#detail-next').click();
  await expect(page.locator('#detail-title')).toHaveText(SECOND);
  await expect(page.locator('#detail-previous')).toHaveAttribute('aria-disabled', 'false');

  for (let step = 0; step < 3; step += 1) {
    await page.locator('#detail-next').click();
  }

  await expect(page.locator('#detail-title')).toHaveText(OLDEST);
  await expect(page.locator('#detail-next')).toHaveAttribute('aria-disabled', 'true');

  await page.locator('#detail-next').dispatchEvent('click');
  await expect(page.locator('#detail-title')).toHaveText(OLDEST);
});

test('stepping stays inside what the filter is showing', async ({ page }) => {
  await seedLibrary(page);
  await openApp(page);

  /* Two memories carry the trail tag, and they are not next to each other in the full list. */
  await page.locator('#filters-toggle').click();
  await page.locator('.tag-chip', { hasText: 'trail' }).click();
  await expect(page.locator('.memory-list li')).toHaveCount(2);

  await openDetail(page);
  await expect(page.locator('#detail-title')).toHaveText('Hell Gate hike');

  await page.locator('#detail-next').click();
  await expect(page.locator('#detail-title')).toHaveText(OLDEST);
  await expect(page.locator('#detail-next')).toHaveAttribute('aria-disabled', 'true');
});

test('Escape closes the view, and so does the browser Back button', async ({ page }) => {
  await seedLibrary(page);
  await openApp(page);

  await openDetail(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#memory-detail')).toBeHidden();
  expect(await page.evaluate(() => window.location.search)).toBe('');

  await openDetail(page);
  await expect(page).toHaveURL(/memory=m5/);

  await page.goBack();
  await expect(page.locator('#memory-detail')).toBeHidden();
  expect(await page.evaluate(() => window.location.search)).toBe('');

  /* And Forward brings it back, because the URL is what decides in both directions. */
  await page.goForward();
  await expect(page.locator('#memory-detail')).toBeVisible();
  await expect(page.locator('#detail-title')).toHaveText(NEWEST);
});

test('stepping does not pile up history entries', async ({ page }) => {
  await seedLibrary(page);
  await openApp(page);

  const before = await page.evaluate(() => window.history.length);
  await openDetail(page);
  const opened = await page.evaluate(() => window.history.length);

  /* Opening is navigation and pushes exactly one entry. */
  expect(opened).toBe(before + 1);

  for (let step = 0; step < 4; step += 1) {
    await page.locator('#detail-next').click();
  }
  await expect(page.locator('#detail-title')).toHaveText(OLDEST);

  /* Stepping is not. Four presses that each pushed would put four entries between the reader
     and the list, and Back would walk out one memory at a time. */
  expect(await page.evaluate(() => window.history.length)).toBe(opened);
  await expect(page).toHaveURL(/memory=m1/);

  await page.goBack();
  await expect(page.locator('#memory-detail')).toBeHidden();
});

test('a deep link opens the memory, and closing it stays in the app', async ({ page }) => {
  await seedLibrary(page);
  await openApp(page, '?memory=m3');

  await expect(page.locator('#memory-detail')).toBeVisible();
  await expect(page.locator('#detail-title')).toHaveText('Hell Gate hike');

  /* The entry the page loaded on is the one it is already sitting on, so closing rewrites it
     rather than going back - which would leave the app altogether. */
  await page.locator('#detail-back').click();
  await expect(page.locator('#memory-detail')).toBeHidden();
  await expect(page.locator('.memory-list li')).toHaveCount(5);
  expect(await page.evaluate(() => window.location.search)).toBe('');
});

test('a deep link carries its filters, and keeps them when the view closes', async ({ page }) => {
  await seedLibrary(page);
  await openApp(page, '?tags=trail&memory=m1');

  await expect(page.locator('#memory-detail')).toBeVisible();
  await expect(page.locator('#detail-title')).toHaveText(OLDEST);

  await page.locator('#detail-back').click();
  await expect(page.locator('.memory-list li')).toHaveCount(2);
  expect(await page.evaluate(() => window.location.search)).toBe('?tags=trail');
});

test('an unusable memory id is dropped from the url with no fuss', async ({ page }) => {
  await seedLibrary(page);

  /* Unknown, and excluded by a filter: neither is an error anyone can act on, because a URL
     is edited, shared and half-remembered. */
  for (const [search, expected] of [
    ['?memory=nothing-like-this', ''],
    ['?q=karura&memory=m5', '?q=karura']
  ]) {
    await openApp(page, search);
    await expect(page.locator('#memory-detail')).toBeHidden();
    expect(await page.evaluate(() => window.location.search)).toBe(expected);
  }
});

test('a filter that excludes the open memory closes the view', async ({ page }) => {
  await seedLibrary(page);
  await openApp(page);

  /* A tag inside the view filters by it and comes back to the list, which is the one path
     that can narrow the filters from in there. */
  await openDetail(page, { index: 1 });
  await expect(page.locator('#detail-title')).toHaveText(SECOND);
  await page.locator('.detail-tag', { hasText: 'food' }).click();

  await expect(page.locator('#memory-detail')).toBeHidden();
  await expect(page.locator('.memory-list li')).toHaveCount(2);
  await expect(page).toHaveURL(/tags=food/);
  expect(await page.evaluate(() => window.location.search)).not.toContain('memory=');
});

test('deleting from the view comes back to the list, and Undo restores the card', async ({ page }) => {
  await seedLibrary(page);
  await openApp(page);

  await openDetail(page);
  await page.locator('#detail-delete').click();

  await expect(page.locator('#memory-detail')).toBeHidden();
  await expect(page.locator('.memory-list li')).toHaveCount(4);
  await expect(page.locator('#toast-region')).toContainText('Deleted');

  await page.locator('.toast-action').click();
  await expect(page.locator('.memory-list li')).toHaveCount(5);

  const focused = await page.evaluate(() => document.activeElement.textContent);
  expect(focused).toContain(NEWEST);
});

test('an edit made from the view is shown by the view', async ({ page }) => {
  await seedLibrary(page);
  await openApp(page);

  await openDetail(page);
  await page.locator('#detail-edit').click();
  await page.locator('#memory-title').fill('Renamed from the detail view');
  await page.locator('#memory-save').click();

  await expect(page.locator('#memory-dialog')).toBeHidden();
  /* Still open, and redrawn from the saved record rather than left showing what was typed
     over. */
  await expect(page.locator('#memory-detail')).toBeVisible();
  await expect(page.locator('#detail-title')).toHaveText('Renamed from the detail view');

  await page.locator('#detail-back').click();
  await expect(page.locator('.memory-list')).toContainText('Renamed from the detail view');
});

test('photos open the lightbox at the one that was pressed', async ({ page }) => {
  await seedLibrary(page, [memory('only', 'Two pictures', '2025-01-01', -1.29, 36.82)]);
  await openApp(page);

  const jpeg = await generatePhotoBytes(page);
  await openDetail(page);
  await page.locator('#detail-edit').click();
  await page.locator('#memory-photo-input').setInputFiles([
    { name: 'one.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpeg, 'base64') },
    { name: 'two.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpeg, 'base64') }
  ]);
  await expect(page.locator('#memory-photos img')).toHaveCount(2);
  await page.locator('#memory-save').click();
  await expect(page.locator('#memory-dialog')).toBeHidden();

  /* Two or more photos, so the strip appears under the hero. */
  await expect(page.locator('.detail-thumb-button')).toHaveCount(2);

  await page.locator('.detail-thumb-button').nth(1).click();
  await expect(page.locator('#lightbox')).toBeVisible();
  await expect(page.locator('#lightbox-position')).toHaveText('2 of 2');
});

test('Show on map gives the map back first on a narrow screen', async ({ page }) => {
  /* The bug this guards: closing the view goes back through history, which is asynchronous,
     while the map pane stays display:none until the view is actually gone. The fly ran against
     a Leaflet map with no size, which prunes every marker and goes nowhere: no pin, no popup,
     and a blank map where the memory should have been. */
  await page.setViewportSize({ width: 375, height: 760 });
  await seedLibrary(page, [memory('only', 'Somewhere worth seeing', '2025-01-01', -1.29, 36.82)]);
  await openApp(page);

  await openDetail(page, { narrow: true });
  await page.locator('#detail-show').click();

  await expect(page.locator('#memory-detail')).toBeHidden();
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.locator('.leaflet-marker-icon')).toHaveCount(1);
  await expect(page.locator('.leaflet-popup')).toBeVisible();
  await expect(page.locator('.popup-title')).toHaveText('Somewhere worth seeing');

  /* And it did not push the reader out of the app on the way: Back still has the list. */
  expect(await page.evaluate(() => window.location.search)).toBe('');
});

test('Show on map lands the pin in the middle, not against the edge', async ({ page }) => {
  /* The fly has to be allowed to finish. Leaflet 1.9 pans the map when a marker takes focus
     (Marker._panOnFocus), so focusing the pin on the way there cancels the animation and
     leaves it at the edge of the map with its popup running off the side. */
  await seedLibrary(page, [
    memory('a', 'Over here', '2025-01-01', -1.3521, 36.6412),
    memory('b', 'Over there', '2024-01-01', -1.2864, 36.8172)
  ]);
  await openApp(page);

  await openDetail(page);
  await page.locator('#detail-show').click();
  await expect(page.locator('.leaflet-popup')).toBeVisible();

  /* Settled, because flyTo animates and the assertion is about where it ended up. */
  await page.waitForFunction(
    () => {
      const popup = document.querySelector('.leaflet-popup');
      if (!popup) return false;
      const left = popup.getBoundingClientRect().left;
      const settled = window.__lastLeft === left;
      window.__lastLeft = left;
      return settled;
    },
    null,
    { timeout: 10000 }
  );

  const placed = await page.evaluate(() => {
    const map = document.getElementById('map').getBoundingClientRect();
    const popup = document.querySelector('.leaflet-popup').getBoundingClientRect();
    return { mapLeft: map.left, mapRight: map.right, popupLeft: popup.left, popupRight: popup.right };
  });

  expect(placed.popupLeft, JSON.stringify(placed)).toBeGreaterThanOrEqual(placed.mapLeft);
  expect(placed.popupRight, JSON.stringify(placed)).toBeLessThanOrEqual(placed.mapRight);
});

test('stepping quickly through memories does not hoard object URLs', async ({ page }) => {
  /* Every render reads blobs out of IndexedDB, and a read that lands after Next has moved on
     belongs to a view that is no longer on screen. Without the guard it would still create a
     URL, and nothing would be left to revoke it. */
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

  await seedLibrary(page);
  await openApp(page);

  /* A photo on every memory, so every step has blobs to read. Written through the real
     backend, under distinct ids, or the orphan sweep would take them straight back out. */
  const jpeg = await generatePhotoBytes(page);
  await page.evaluate(async (base64) => {
    const { createIndexedDbBackend } = await import('/src/js/photos/indexeddb-backend.js');
    const backend = createIndexedDbBackend({ databaseName: 'waypoints' });

    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'image/jpeg' });

    const envelope = JSON.parse(window.localStorage.getItem('waypoints:v1'));
    const createdAt = new Date().toISOString();

    for (const [index, record] of envelope.memories.entries()) {
      const id = 'photo-' + index;
      await backend.put({ id, blob, thumb: blob, width: 8, height: 8, createdAt });
      record.photoIds = [id];
    }

    window.localStorage.setItem('waypoints:v1', JSON.stringify(envelope));
  }, jpeg);

  await page.reload();
  await expect(page.locator('.memory-list li')).toHaveCount(5);

  await openDetail(page);
  await expect(page.locator('.detail-hero-button img')).toBeVisible();

  /* Thirty presses over five memories, so it runs off the end and back through the whole
     order several times. */
  for (let press = 0; press < 30; press += 1) {
    const next = page.locator('#detail-next');

    if ((await next.getAttribute('aria-disabled')) === 'true') {
      await page.locator('#detail-previous').click();
    } else {
      await next.click();
    }
  }

  await expect(page.locator('.detail-hero-button img')).toBeVisible();

  const stats = await page.evaluate(() => ({ live: window.__live, peak: window.__peak }));

  /* One hero at a time. The list's own thumbnails are released the moment the view covers
     it, so the bound here is small and flat however long the stepping goes on. */
  expect(stats.live).toBeLessThanOrEqual(3);
  expect(stats.peak).toBeLessThan(20);
});
