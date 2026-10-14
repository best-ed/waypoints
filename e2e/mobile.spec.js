import { test, expect, openApp, seedLibrary, mockNominatim } from './fixtures.js';

/* What only happens below the breakpoint. The rest of the suite runs at 1280 and would never
   see any of it. */

const NARROW = { width: 375, height: 812 };

/* hasTouch, not just the viewport: the 44px rules are behind (pointer: coarse), and a desktop
   browser at phone width still reports a fine pointer. Without this the whole touch half of
   this file would pass by testing rules that were never applied. */
test.use({ viewport: NARROW, hasTouch: true, isMobile: true });

async function openMap(page) {
  await seedLibrary(page);
  await openApp(page);
  await page.locator('#view-map').click();
}

test('the place search is an icon until it is asked for', async ({ page }) => {
  await openMap(page);

  const toggle = page.locator('.place-search-toggle');
  const panel = page.locator('.place-search-panel');

  await expect(toggle).toBeVisible();
  await expect(panel).toBeHidden();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toHaveAttribute('aria-controls', 'place-search-panel');

  await toggle.click();

  await expect(panel).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  /* Opening it is asking to type in it. */
  await expect(page.locator('.place-search-input')).toBeFocused();
});

test('the expanded field spans the map pane', async ({ page }) => {
  await openMap(page);
  await page.locator('.place-search-toggle').click();

  const panel = await page.locator('.place-search-panel').boundingBox();
  const pane = await page.locator('#map').boundingBox();

  /* Within the control's own margin either side. */
  expect(panel.width).toBeGreaterThan(pane.width - 40);
});

test('Escape collapses it and gives focus back to the icon', async ({ page }) => {
  await openMap(page);

  const toggle = page.locator('.place-search-toggle');
  await toggle.click();
  await page.locator('.place-search-input').fill('Nairobi');

  await page.keyboard.press('Escape');

  await expect(page.locator('.place-search-panel')).toBeHidden();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
});

test('the close button collapses it and gives focus back to the icon', async ({ page }) => {
  await openMap(page);

  const toggle = page.locator('.place-search-toggle');
  await toggle.click();
  await page.locator('.place-search-close').click();

  await expect(page.locator('.place-search-panel')).toBeHidden();
  await expect(toggle).toBeFocused();
});

test('results arrive as a sheet under the field, and choosing one closes the panel', async ({ page }) => {
  await mockNominatim(page);
  await openMap(page);

  await page.locator('.place-search-toggle').click();
  await page.locator('.place-search-input').fill('Nairobi');
  await page.locator('.place-search-submit').click();

  const results = page.locator('.place-search-results');
  await expect(results).toBeVisible();

  const sheet = await results.boundingBox();
  const field = await page.locator('.place-search-form').boundingBox();

  expect(sheet.y).toBeGreaterThan(field.y);
  expect(sheet.width).toBeGreaterThan(field.width - 8);

  await page.locator('.place-search-result-button').first().click();

  /* A chosen place puts a pin on the map, which is the thing the panel was covering. */
  await expect(page.locator('.pin-result')).toBeVisible();
});

/* The usage policy does not bend for a layout change: still submit only, still nothing on a
   keystroke. The global fixture fails any test that reaches Nominatim without a route, so an
   unrouted keystroke here would be caught as well. */
test('typing still sends nothing', async ({ page }) => {
  let requests = 0;

  await page.route('**nominatim.openstreetmap.org**', (route) => {
    requests += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await openMap(page);
  await page.locator('.place-search-toggle').click();
  await page.locator('.place-search-input').pressSequentially('Nairobi', { delay: 40 });
  await page.waitForTimeout(600);

  expect(requests).toBe(0);
});
