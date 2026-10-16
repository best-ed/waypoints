import { test, expect, openApp, seedPhotos, settle, withSettings } from './fixtures.js';

/* One screenshot per state that would be obviously wrong if it changed by accident. These are
   not assertions about what is correct - axe and the e2e suite do that - they are a record of
   what the app looked like when somebody last looked at it on purpose.

   Chromium only, and the baselines carry Playwright's platform suffix, so a run on another OS
   writes its own rather than failing against these. See CLAUDE.md for generating the Linux
   set when CI can run again. */

const WIDE = { width: 1280, height: 900 };
const NARROW = { width: 375, height: 812 };

/* Font hinting and the map's own rasterising differ by a pixel here and there between runs of
   the same build, and a few glyph edges is about 0.1% of a 1280x900 frame. 0.2% is comfortably
   above that and far below anything real: the smallest change this suite exists to catch - a
   control moving, a colour changing, a panel resizing - is thousands of pixels, which is a
   whole percent of the frame at this size. */
const TOLERANCE = { maxDiffPixelRatio: 0.002 };

async function shoot(page, name) {
  await expect(page).toHaveScreenshot(name, {
    ...TOLERANCE,
    /* Belt and braces: the project already runs with reduced motion, and a transition caught
       halfway is the one thing that would make these flake. */
    animations: 'disabled',
    caret: 'hide'
  });
}

test('default, wide, light', async ({ page }) => {
  await page.setViewportSize(WIDE);
  await page.emulateMedia({ colorScheme: 'light' });
  await openApp(page);

  await shoot(page, 'default-wide-light.png');
});

test('default, wide, dark', async ({ page }) => {
  await page.setViewportSize(WIDE);
  await page.emulateMedia({ colorScheme: 'dark' });
  await openApp(page);

  await shoot(page, 'default-wide-dark.png');
});

test('the map pane on a phone', async ({ page }) => {
  await page.setViewportSize(NARROW);
  await openApp(page, { narrow: true });

  await shoot(page, 'narrow-map.png');
});

test('the list pane on a phone', async ({ page }) => {
  await page.setViewportSize(NARROW);
  await openApp(page);
  await page.locator('#view-list').click();
  await settle(page);

  await shoot(page, 'narrow-list.png');
});

test('the first run', async ({ page }) => {
  await page.setViewportSize(WIDE);
  await page.addInitScript(() => window.localStorage.removeItem('waypoints:sandbox:v1'));
  await openApp(page);

  await shoot(page, 'first-run.png');
});

test('a memory with photos', async ({ page }) => {
  await page.setViewportSize(WIDE);
  await openApp(page);
  await seedPhotos(page);

  await page.locator('.memory-list li button').first().click();
  await expect(page.locator('#memory-detail')).toBeVisible();
  await expect(page.locator('.detail-hero img')).toBeVisible();
  await settle(page);

  await shoot(page, 'detail-with-photos.png');
});

test('the add dialog with tags and photos', async ({ page }) => {
  await page.setViewportSize(WIDE);
  await openApp(page);
  await seedPhotos(page);

  /* Through Edit rather than by placing a pin: a click in the middle of the map at this width
     lands on a seeded marker, and this is a picture of the form rather than of placement. */
  await page.locator('.memory-list li button').first().click();
  await page.locator('#detail-edit').click();
  await expect(page.locator('#memory-dialog')).toBeVisible();
  await expect(page.locator('#memory-photos img').first()).toBeVisible();
  await settle(page);

  await shoot(page, 'form-with-tags-and-photos.png');
});

test('settings', async ({ page }) => {
  await page.setViewportSize(WIDE);
  await openApp(page);
  await page.locator('#open-settings').click();
  await expect(page.locator('#settings-dialog')).toBeVisible();
  await settle(page);

  await shoot(page, 'settings.png');
});

test('the journey player, wide', async ({ page }) => {
  await page.setViewportSize(WIDE);
  await openApp(page);
  await page.locator('#journey-toggle').click();
  await expect(page.locator('#journey-player')).toBeVisible();
  await settle(page);

  await shoot(page, 'journey-player-wide.png');
});

test('the journey player, narrow', async ({ page }) => {
  await page.setViewportSize(NARROW);
  await openApp(page);
  /* The toggle is in the sidebar and the player is over the map, which at this width are two
     different panes. */
  await page.locator('#view-list').click();
  await page.locator('#journey-toggle').click();
  await page.locator('#view-map').click();
  await expect(page.locator('#journey-player')).toBeVisible();
  await settle(page);

  await shoot(page, 'journey-player-narrow.png');
});

test('the end of a journey', async ({ page }) => {
  await page.setViewportSize(WIDE);
  await openApp(page);
  await page.locator('#journey-toggle').click();

  const scrubber = page.locator('#player-scrubber');
  await scrubber.fill(await scrubber.getAttribute('max'));
  await page.locator('#player-play').click();
  await expect(page.locator('#player-end')).toBeVisible({ timeout: 15000 });
  await settle(page);

  await shoot(page, 'journey-end-card.png');
});

test('the filters panel open', async ({ page }) => {
  await page.setViewportSize(WIDE);
  await openApp(page);
  await page.locator('#filters-toggle').click();
  await expect(page.locator('#filters-panel')).toBeVisible();
  await settle(page);

  await shoot(page, 'filters-expanded.png');
});

test('nothing matches', async ({ page }) => {
  await page.setViewportSize(WIDE);
  await openApp(page);
  await page.locator('#memory-search').fill('nothing here matches this');
  await expect(page.locator('#memory-empty')).toBeVisible();
  await settle(page);

  await shoot(page, 'no-results.png');
});

/* ---- the dark map, both ways ------------------------------------------------ */

/* There is no dark basemap to use, so dark mode turns the light tiles over instead: map.css
   inverts and desaturates the tile pane alone, leaving pins, photos and the journey line in
   their own panes untouched. It is an approximation rather than the thing itself, which is why
   it is a setting, and these are the two sides of that setting.

   The pair is the point. One of them on its own says nothing: what has to stay true is that
   the dimming reaches the tiles and nothing else. */
test('the dark map, dimmed', async ({ page }) => {
  await page.setViewportSize(WIDE);
  await page.emulateMedia({ colorScheme: 'dark' });
  await withSettings(page, { dimMapInDark: true });
  await openApp(page);

  await shoot(page, 'dark-map-dimmed.png');
});

test('the dark map, with the dimming off', async ({ page }) => {
  await page.setViewportSize(WIDE);
  await page.emulateMedia({ colorScheme: 'dark' });
  await withSettings(page, { dimMapInDark: false });
  await openApp(page);

  await shoot(page, 'dark-map-undimmed.png');
});
