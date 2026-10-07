import { test, expect, openApp, seedLibrary } from './fixtures.js';

test('the app boots under the production CSP with no console errors', async ({ page }) => {
  await seedLibrary(page);
  await openApp(page);

  await expect(page.locator('.memory-list li')).toHaveCount(5);
  await expect(page.locator('.leaflet-container')).toBeVisible();
});
