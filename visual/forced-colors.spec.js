import { test, expect, openApp, seedPhotos, settle } from './fixtures.js';

/* The same states again with the system palette forced.

   Forced colours is the one mode where the design system is not in charge: the user agent
   replaces every colour we chose with a handful of system keywords, and everything that
   carried meaning through colour alone collapses into two of them. `forced-colors.css` restates
   those in system colours, and these are the pictures of whether it worked.

   They are worth having as baselines rather than as assertions because the failure mode is
   visual and specific: a pressed chip that no longer reads as pressed, a cover badge that has
   become invisible against its own tile, a scrubber with no track. An assertion would have to
   know which of those to look for. */

test.use({ forcedColors: 'active' });

const WIDE = { width: 1280, height: 900 };
const NARROW = { width: 375, height: 812 };

const TOLERANCE = { maxDiffPixelRatio: 0.002 };

async function shoot(page, name) {
  await expect(page).toHaveScreenshot(name, {
    ...TOLERANCE,
    animations: 'disabled',
    caret: 'hide'
  });
}

test('the list in forced colours', async ({ page }) => {
  await page.setViewportSize(NARROW);
  await openApp(page);
  await page.locator('#view-list').click();
  await settle(page);

  await shoot(page, 'forced-narrow-list.png');
});

test('the map in forced colours', async ({ page }) => {
  await page.setViewportSize(NARROW);
  await openApp(page, { narrow: true });

  await shoot(page, 'forced-narrow-map.png');
});

test('a memory with photos in forced colours', async ({ page }) => {
  await page.setViewportSize(WIDE);
  await openApp(page);
  await seedPhotos(page);

  await page.locator('.memory-list li button').first().click();
  await expect(page.locator('#memory-detail')).toBeVisible();
  await expect(page.locator('.detail-hero img')).toBeVisible();
  await settle(page);

  await shoot(page, 'forced-detail-with-photos.png');
});

/* The two things in the form that say something with colour and nothing else: a tag token,
   which is a tinted bed with no edge, and the Cover badge sitting on its own photo. */
test('the form with tag tokens and a cover badge in forced colours', async ({ page }) => {
  await page.setViewportSize(WIDE);
  await openApp(page);
  await seedPhotos(page);

  await page.locator('.memory-list li button').first().click();
  await page.locator('#detail-edit').click();
  await expect(page.locator('#memory-dialog')).toBeVisible();
  await expect(page.locator('#memory-photos img').first()).toBeVisible();
  await expect(page.locator('.tag-token')).toHaveCount(3);
  await expect(page.locator('.photo-cover-badge')).toBeVisible();
  await settle(page);

  await shoot(page, 'forced-form-tokens-and-cover.png');
});

test('the journey player in forced colours', async ({ page }) => {
  await page.setViewportSize(WIDE);
  await openApp(page);
  await page.locator('#journey-toggle').click();
  await expect(page.locator('#journey-player')).toBeVisible();
  await settle(page);

  await shoot(page, 'forced-journey-player.png');
});

/* A pressed chip and an unpressed one in the same picture: the whole point of the forced
   colours sheet is that the difference survives a palette that has no accent to spend. */
test('active filter chips in forced colours', async ({ page }) => {
  await page.setViewportSize(WIDE);
  await openApp(page);

  await page.locator('#filters-toggle').click();
  await expect(page.locator('#filters-panel')).toBeVisible();
  await page.locator('.chip-filter').first().click();
  await expect(page.locator('#active-filters li')).toHaveCount(1);
  await settle(page);

  await shoot(page, 'forced-active-filters.png');
});

test('the end of a journey in forced colours', async ({ page }) => {
  await page.setViewportSize(WIDE);
  await openApp(page);
  await page.locator('#journey-toggle').click();

  const scrubber = page.locator('#player-scrubber');
  await scrubber.fill(await scrubber.getAttribute('max'));
  await page.locator('#player-play').click();
  await expect(page.locator('#player-end')).toBeVisible({ timeout: 15000 });
  await settle(page);

  await shoot(page, 'forced-journey-end-card.png');
});
