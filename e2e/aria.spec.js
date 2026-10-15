import {
  test,
  expect,
  openApp,
  openDetail,
  seedLibrary,
  seedSettings,
  generatePhotoBytes
} from './fixtures.js';

/* The accessible structure of the components this run added, locked as a snapshot.

   These are not a substitute for a screen reader and are not pretending to be one: a tree can
   be perfectly shaped and still read badly. What they do is fail the suite the moment a role,
   a name or a state disappears, which is the failure that otherwise ships unnoticed - an
   aria-label dropped in a refactor leaves a button that still looks right and is no longer
   reachable by name.

   Scoped tightly on purpose. A snapshot of the whole page would change every time anything
   moved, and a snapshot nobody trusts is a snapshot everybody updates without reading. */

test('the tag combobox, open with suggestions', async ({ page }) => {
  await seedLibrary(page);
  await openApp(page);
  await openDetail(page);
  await page.locator('#detail-edit').click();
  await expect(page.locator('#memory-dialog')).toBeVisible();

  const input = page.locator('#memory-tags');
  await input.click();
  await input.pressSequentially('t', { delay: 40 });
  await expect(page.locator('#memory-tag-listbox')).toBeVisible();

  await expect(page.locator('.tag-combobox')).toMatchAriaSnapshot({ name: 'tag-combobox.yml' });
});

test('a photo tile carries its own controls', async ({ page }) => {
  await seedSettings(page, { suggestPlaceNames: false });
  await seedLibrary(page, []);
  await openApp(page);

  const jpeg = await generatePhotoBytes(page);

  await page.locator('#add-memory').click();
  const map = await page.locator('#map').boundingBox();
  await page.mouse.click(map.x + map.width * 0.5, map.y + map.height * 0.5);
  await expect(page.locator('#memory-dialog')).toBeVisible();

  await page.locator('#memory-photo-input').setInputFiles(
    [0, 1].map((index) => ({
      name: index + '.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from(jpeg, 'base64')
    }))
  );
  await expect(page.locator('.photo-tile')).toHaveCount(2);

  /* The first tile, which is the cover and so has Move earlier and Make cover unavailable. */
  await expect(page.locator('.photo-tile').first()).toMatchAriaSnapshot({ name: 'photo-tile.yml' });
});

test('the journey scrubber and what describes it', async ({ page }) => {
  await seedLibrary(page);
  await openApp(page);
  await page.locator('#journey-toggle').click();
  await expect(page.locator('#journey-player')).toBeVisible();

  await expect(page.locator('#journey-player')).toMatchAriaSnapshot({ name: 'journey-player.yml' });
});

test('the detail view header', async ({ page }) => {
  await seedLibrary(page);
  await openApp(page);
  await openDetail(page);

  /* Opened on the newest memory, so Previous is unavailable and Next is not. */
  await expect(page.locator('.detail-header')).toMatchAriaSnapshot({ name: 'detail-header.yml' });
});

test('the discard prompt', async ({ page }) => {
  await seedSettings(page, { suggestPlaceNames: false });
  await seedLibrary(page, []);
  await openApp(page);

  await page.locator('#add-memory').click();
  const map = await page.locator('#map').boundingBox();
  await page.mouse.click(map.x + map.width * 0.5, map.y + map.height * 0.5);
  await expect(page.locator('#memory-dialog')).toBeVisible();

  await page.locator('#memory-title').fill('Something unsaved');
  await page.locator('#memory-cancel').click();
  await expect(page.locator('#memory-discard')).toBeVisible();

  await expect(page.locator('#memory-discard')).toMatchAriaSnapshot({ name: 'discard-prompt.yml' });
});

test('the Filters disclosure with a filter on', async ({ page }) => {
  await seedLibrary(page);
  await openApp(page, '?tags=trail');

  await expect(page.locator('#active-filters li')).toHaveCount(1);

  await expect(page.locator('#sidebar-controls')).toMatchAriaSnapshot({ name: 'filters.yml' });
});
