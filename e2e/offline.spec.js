import { test, expect, seedLibrary, BASE } from './fixtures.js';

/* The service worker only registers on a development host with ?sw, which is what the suite is
   running against. Each test has its own context, so a worker registered here never leaks into
   another test. */

/* Two engines install and precache exactly as Chromium does and serve through the worker while
   online. Neither will answer from the cache once Playwright's offline emulation is on, and
   each fails in its own way: WebKit's fetch throws "Load failed" and the reload dies with an
   internal error, and Firefox refuses the navigation outright with NS_ERROR_OFFLINE before the
   worker is ever consulted. Both are the harness cutting the connection below the layer the
   worker lives in, rather than anything the app does.

   So the two tests that need a dead network run on Chromium, and everything up to that point -
   registering, installing, filling the precache, serving while online - is still checked on
   all three. Real Safari and real Firefox are the open question, and they are on the manual
   list for the deployed site. */
const needsOfflineServing = (browserName) =>
  ({
    webkit: "Playwright's WebKit does not serve from the service worker cache while offline",
    firefox: "Playwright's Firefox refuses the navigation with NS_ERROR_OFFLINE before the worker sees it"
  })[browserName] ?? false;

async function waitForWorker(page) {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
    timeout: 30000
  });
}

test('boots offline after one online load, and says it is offline', { tag: '@smoke' }, async ({ page, context, browserName }) => {
  test.skip(Boolean(needsOfflineServing(browserName)), needsOfflineServing(browserName) || '');

  await seedLibrary(page);

  await page.goto(BASE + '?sw');
  await waitForWorker(page);

  /* The precache is filled by install; give the worker a moment to finish before pulling the
     plug, since an install that is still running has nothing to serve. */
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          const names = await caches.keys();
          const precache = names.find((name) => name.startsWith('waypoints-precache-'));
          if (!precache) return 0;
          return (await (await caches.open(precache)).keys()).length;
        }),
      { timeout: 30000 }
    )
    .toBeGreaterThan(50);

  await context.setOffline(true);
  await page.reload();

  /* Everything the app needs came out of the cache. */
  await expect(page.locator('.memory-list li')).toHaveCount(5);
  await expect(page.locator('.leaflet-container')).toBeVisible();
  expect(await page.evaluate(() => typeof window.L)).toBe('object');
  expect(await page.evaluate(() => typeof window.L.markerClusterGroup)).toBe('function');

  const banner = page.locator('#offline-banner');
  await expect(banner).toBeVisible();
  await expect(page.locator('#offline-banner-text')).toContainText('memories are here');

  /* Dismissing lasts for this outage only. */
  await page.locator('#offline-banner-dismiss').click();
  await expect(banner).toBeHidden();

  await context.setOffline(false);
});

test('the worker serves the page itself, not just its parts', async ({ page, context, browserName }) => {
  test.skip(Boolean(needsOfflineServing(browserName)), needsOfflineServing(browserName) || '');

  await seedLibrary(page);
  await page.goto(BASE + '?sw');
  await waitForWorker(page);
  await expect
    .poll(async () => page.evaluate(async () => (await caches.keys()).length), { timeout: 30000 })
    .toBeGreaterThan(0);

  await context.setOffline(true);

  /* A navigation to a path with a query string still gets the cached page: the app reads its
     own search, so every route is the same document. */
  await page.goto(BASE + '?sw&q=mombasa');
  await expect(page.locator('.memory-list li')).toHaveCount(1);
  await expect(page.locator('#memory-search')).toHaveValue('mombasa');

  await context.setOffline(false);
});

test('the sw flag survives a filter change and turns the worker off again', async ({ page }) => {
  await seedLibrary(page);
  await page.goto(BASE + '?sw');
  await waitForWorker(page);

  await page.locator('#memory-search').fill('mombasa');
  await expect(page).toHaveURL(/sw/);
  await expect(page).toHaveURL(/q=mombasa/);

  /* Loading without the flag on a development host clears it, so ?sw is a switch and not a
     one way door. */
  await page.goto(BASE);
  await expect
    .poll(async () => page.evaluate(() => navigator.serviceWorker.getRegistrations().then((r) => r.length)), {
      timeout: 15000
    })
    .toBe(0);

  /* The page is still controlled: unregistering does not release a document the worker already
     has. So this drags the map, which asks for tiles the worker will handle after the cleanup
     has run. Serving one used to open the tile cache again and put the whole thing back, and
     this test failed about once in twenty under parallel load because the map's own first
     tiles were sometimes late enough to do it by themselves. Doing it on purpose is what turns
     that into something either true or false every time. */
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  const box = await page.locator('#map').boundingBox();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(1500);

  const caches = await page.evaluate(() =>
    window.caches.keys().then((names) => names.filter((name) => name.startsWith('waypoints-')))
  );
  expect(caches).toEqual([]);
});
