import {
  test,
  expect,
  openApp,
  openDetail,
  seedLibrary,
  seedSettings,
  generatePhotoBytes,
  memory,
  BASE
} from './fixtures.js';

/* The add and edit dialog. The pure parts - what counts as dirty, what the suggestions are,
   what a move does to a list - are unit tested; these are the paths that only exist once a
   real dialog, a real clipboard and a real drag are involved. */

const LIBRARY = [
  memory('m1', 'Karura forest walk', '2023-03-12', -1.2359, 36.8137, ['trail', 'view']),
  memory('m2', 'Mombasa old town', '2023-07-04', -4.0624, 39.6682, ['food', 'coast']),
  memory('m3', 'Hell Gate hike', '2024-01-20', -0.9, 36.3167, ['trail'])
];

/* Placing a pin reverse geocodes unless the setting is off, and the fixture fails any test
   that lets a request reach Nominatim. None of these is about that lookup. */
async function startClean(page, memories = []) {
  await seedSettings(page, { suggestPlaceNames: false });
  await seedLibrary(page, memories);
}

async function openAdd(page, { narrow = false } = {}) {
  if (narrow) {
    await page.locator('#view-map').click();
  }

  await page.locator('#add-memory').click();
  const box = await page.locator('#map').boundingBox();
  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.45);
  await expect(page.locator('#memory-dialog')).toBeVisible();
}

/* A real JPEG, drawn in the page and handed over through a DataTransfer, which is the only way
   to put a file on a synthetic drop or paste. */
async function addPhotoThrough(page, how) {
  const jpeg = await generatePhotoBytes(page);

  return page.evaluate(
    async ({ base64, kind }) => {
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
      const file = new File([bytes], kind + '.jpg', { type: 'image/jpeg' });
      const data = new DataTransfer();
      data.items.add(file);

      if (kind === 'drop') {
        const zone = document.getElementById('memory-photo-drop');
        zone.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: data }));
        zone.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: data }));
        const dragging = zone.classList.contains('is-dragging');
        zone.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: data }));
        return { dragging };
      }

      document.getElementById('memory-note').focus();
      document
        .getElementById('memory-dialog')
        .dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
      return { dragging: null };
    },
    { base64: jpeg, kind: how }
  );
}

/* ---- validation and saving ---------------------------------------------------- */

test('a field error clears as soon as the field is right, not at the next submit', async ({ page }) => {
  await startClean(page);
  await page.goto(BASE);
  await openAdd(page);

  await page.locator('#memory-save').click();
  await expect(page.locator('#memory-title-error')).toBeVisible();
  await expect(page.locator('#memory-title')).toHaveAttribute('aria-invalid', 'true');

  await page.locator('#memory-title').fill('Now it has a title');
  await expect(page.locator('#memory-title-error')).toBeHidden();
  await expect(page.locator('#memory-title')).toHaveAttribute('aria-invalid', 'false');

  /* And nothing new is reported while someone is still typing: an empty note is fine and a
     half-typed title is not an error yet. */
  await expect(page.locator('#memory-note-error')).toBeHidden();
});

test('Ctrl+Enter saves from anywhere in the form, including the note', async ({ page }) => {
  await startClean(page);
  await page.goto(BASE);
  await openAdd(page);

  await page.locator('#memory-title').fill('Saved with the keyboard');
  await page.locator('#memory-note').click();
  await page.keyboard.type('Enter on its own has to stay a new line.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Like that.');

  /* Plain Enter did not submit. */
  await expect(page.locator('#memory-dialog')).toBeVisible();
  expect(await page.locator('#memory-note').inputValue()).toContain('\n');

  await page.keyboard.press('Control+Enter');
  await expect(page.locator('#memory-dialog')).toBeHidden();
  await expect(page.locator('.memory-list li')).toHaveCount(1);
});

/* ---- tags --------------------------------------------------------------------- */

test('tags become tokens, and the library is offered as you type', async ({ page }) => {
  await startClean(page, LIBRARY);
  await openApp(page);
  await openAdd(page);

  const input = page.locator('#memory-tags');
  await input.click();

  /* An empty field offers what the library already calls things. */
  await expect(page.locator('#memory-tag-listbox')).toBeVisible();
  await expect(input).toHaveAttribute('aria-expanded', 'true');

  await input.type('tr');
  await expect(page.locator('#memory-tag-listbox li')).toHaveText(['trail']);

  await page.keyboard.press('ArrowDown');
  await expect(input).toHaveAttribute('aria-activedescendant', /option-0/);

  await page.keyboard.press('Enter');
  await expect(page.locator('.tag-token')).toHaveText(['trail']);
  await expect(input).toHaveValue('');
  await expect(input).toHaveAttribute('aria-expanded', 'false');

  /* A tag already on the memory is not offered again. */
  await input.type('tr');
  await expect(page.locator('#memory-tag-listbox li')).toHaveCount(0);

  /* Free entry still works, and a comma commits. */
  await input.fill('');
  await input.type('somewhere new,and another');
  await expect(page.locator('.tag-token')).toHaveText(['trail', 'somewhere new']);
  await page.keyboard.press('Enter');
  await expect(page.locator('.tag-token')).toHaveText(['trail', 'somewhere new', 'and another']);

  /* Backspace in an empty box takes the last one off. */
  await page.keyboard.press('Backspace');
  await expect(page.locator('.tag-token')).toHaveText(['trail', 'somewhere new']);

  /* And the remove button says which tag it removes. */
  await expect(page.locator('.tag-token-remove').first()).toHaveAttribute('aria-label', 'Remove tag trail');
  await page.locator('.tag-token-remove').first().click();
  await expect(page.locator('.tag-token')).toHaveText(['somewhere new']);

  await page.locator('#memory-title').fill('Tagged by token');
  await page.locator('#memory-save').click();
  await expect(page.locator('#memory-dialog')).toBeHidden();

  const stored = await page.evaluate(
    () => JSON.parse(localStorage.getItem('waypoints:v1')).memories.find((m) => m.title === 'Tagged by token').tags
  );
  expect(stored).toEqual(['somewhere new']);
});

test('Escape closes the suggestions before it closes the dialog', async ({ page }) => {
  await startClean(page, LIBRARY);
  await openApp(page);
  await openAdd(page);

  await page.locator('#memory-tags').click();
  await expect(page.locator('#memory-tag-listbox')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator('#memory-tag-listbox')).toBeHidden();
  await expect(page.locator('#memory-dialog')).toBeVisible();
});

test('the tag limits are enforced where they are typed', async ({ page }) => {
  await startClean(page);
  await page.goto(BASE);
  await openAdd(page);

  const input = page.locator('#memory-tags');
  await input.click();

  for (let index = 0; index < 10; index += 1) {
    await input.type('tag' + index);
    await page.keyboard.press('Enter');
  }

  await expect(page.locator('.tag-token')).toHaveCount(10);

  await input.type('one too many');
  await page.keyboard.press('Enter');
  await expect(page.locator('.tag-token')).toHaveCount(10);
  await expect(page.locator('#memory-tags-error')).toContainText('10 tags at most');
});

/* ---- photos -------------------------------------------------------------------- */

test('a photo can be dropped on the grid or pasted into the form', async ({ page }) => {
  await startClean(page);
  await page.goto(BASE);
  await openAdd(page);

  const dropped = await addPhotoThrough(page, 'drop');
  expect(dropped.dragging, 'the zone lights up while a file is over it').toBe(true);

  await expect(page.locator('#memory-photos img')).toHaveCount(1);
  await expect(page.locator('#memory-photo-drop')).not.toHaveClass(/is-dragging/);

  await addPhotoThrough(page, 'paste');
  await expect(page.locator('#memory-photos img')).toHaveCount(2);
  await expect(page.locator('#memory-photos-count')).toHaveText('2 of 6');
});

test('pasting text into a field is still just text', async ({ page }) => {
  await startClean(page);
  await page.goto(BASE);
  await openAdd(page);

  const prevented = await page.evaluate(() => {
    const note = document.getElementById('memory-note');
    note.focus();
    const data = new DataTransfer();
    data.setData('text/plain', 'some pasted words');
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data });
    note.dispatchEvent(event);
    return event.defaultPrevented;
  });

  expect(prevented).toBe(false);
  await expect(page.locator('#memory-photos img')).toHaveCount(0);
});

test('photos reorder by keyboard and by drag, and the first one is the cover', async ({ page }) => {
  await startClean(page);
  await page.goto(BASE);
  await openAdd(page);

  const jpeg = await generatePhotoBytes(page);
  await page.locator('#memory-photo-input').setInputFiles(
    ['a', 'b', 'c'].map((name) => ({
      name: name + '.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from(jpeg, 'base64')
    }))
  );
  await expect(page.locator('#memory-photos img')).toHaveCount(3);

  /* The cover is said on the tile, not left to be worked out from position. */
  await expect(page.locator('.photo-cover-badge')).toHaveCount(1);
  await expect(page.locator('.photo-tile').first().locator('.photo-cover-badge')).toBeVisible();

  /* The ends do nothing rather than leaving the tab order. */
  await expect(page.locator('.photo-tile').first().locator('[data-move="earlier"]')).toHaveAttribute(
    'aria-disabled',
    'true'
  );
  await expect(page.locator('.photo-tile').last().locator('[data-move="later"]')).toHaveAttribute(
    'aria-disabled',
    'true'
  );

  /* By photo id, not by the image's src: the grid is rebuilt on every change and every object
     URL with it, so a src says nothing about which photo is in a tile. */
  const idsNow = () =>
    page.evaluate(() => [...document.querySelectorAll('.photo-tile')].map((tile) => tile.dataset.photoId));
  const before = await idsNow();

  await page.locator('.photo-tile').nth(2).locator('[data-move="cover"]').click();
  await expect(page.locator('#memory-photos-status')).toHaveText('Photo 3 is now the cover');

  /* Focus followed the photo rather than staying at the position it left, so a second press
     moves the same picture again. */
  expect(await page.evaluate(() => document.activeElement.getAttribute('aria-label'))).toBe(
    'Make photo 1 the cover'
  );

  expect((await idsNow())[0]).toBe(before[2]);

  await page.locator('.photo-tile').first().locator('[data-move="later"]').click();
  await expect(page.locator('#memory-photos-status')).toHaveText('Photo 1 moved to position 2');

  /* And by drag, which is the same move through a different door. */
  await page.evaluate(() => {
    const tiles = [...document.querySelectorAll('.photo-tile')];
    const data = new DataTransfer();
    tiles[2].dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: data }));
    tiles[0].dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: data }));
    tiles[0].dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: data }));
  });
  await expect(page.locator('#memory-photos-status')).toHaveText('Photo 3 is now the cover');

  /* Three moves from [a, b, c]: c to the front gives [c, a, b], c one later gives [a, c, b],
     then dragging the third onto the first gives [b, a, c]. */
  expect(await idsNow()).toEqual([before[1], before[0], before[2]]);
  const order = await idsNow();

  await page.locator('#memory-title').fill('Ordered pictures');
  await page.locator('#memory-save').click();
  await expect(page.locator('#memory-dialog')).toBeHidden();

  /* The order on screen is the order in the record: photoIds is the whole of it, and nothing
     in the schema changed to carry a cover. */
  const stored = await page.evaluate(
    () => JSON.parse(localStorage.getItem('waypoints:v1')).memories[0].photoIds
  );
  expect(stored).toEqual(order);
});

test('reordering an edited memory applies only on save', async ({ page }) => {
  await startClean(page, [memory('only', 'Has pictures', '2025-01-01', -1.29, 36.82)]);
  await openApp(page);

  const jpeg = await generatePhotoBytes(page);
  await openDetail(page);
  await page.locator('#detail-edit').click();
  await page.locator('#memory-photo-input').setInputFiles(
    ['a', 'b'].map((name) => ({
      name: name + '.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from(jpeg, 'base64')
    }))
  );
  await expect(page.locator('#memory-photos img')).toHaveCount(2);
  await page.locator('#memory-save').click();
  await expect(page.locator('#memory-dialog')).toBeHidden();

  const saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem('waypoints:v1')).memories[0].photoIds
  );

  /* Reorder, then throw it away. */
  await page.locator('#detail-edit').click();
  await page.locator('.photo-tile').nth(1).locator('[data-move="cover"]').click();
  await page.locator('#memory-cancel').click();
  await page.locator('#memory-discard-confirm').click();
  await expect(page.locator('#memory-dialog')).toBeHidden();

  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('waypoints:v1')).memories[0].photoIds)
  ).toEqual(saved);

  /* Reorder, and keep it. */
  await page.locator('#detail-edit').click();
  await page.locator('.photo-tile').nth(1).locator('[data-move="cover"]').click();
  await page.locator('#memory-save').click();
  await expect(page.locator('#memory-dialog')).toBeHidden();

  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('waypoints:v1')).memories[0].photoIds)
  ).toEqual([saved[1], saved[0]]);
});

/* ---- the discard guard ---------------------------------------------------------- */

test('a clean form closes without a word', async ({ page }) => {
  await startClean(page);
  await page.goto(BASE);

  await openAdd(page);
  await page.locator('#memory-cancel').click();
  await expect(page.locator('#memory-dialog')).toBeHidden();

  await openAdd(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#memory-dialog')).toBeHidden();
});

test('a dirty form asks before it throws anything away', async ({ page }) => {
  await startClean(page);
  await page.goto(BASE);
  await openAdd(page);

  await page.locator('#memory-title').fill('Worth keeping');

  for (const leave of ['cancel', 'escape', 'backdrop']) {
    if (leave === 'cancel') {
      await page.locator('#memory-cancel').click();
    } else if (leave === 'escape') {
      await page.keyboard.press('Escape');
    } else {
      await page.mouse.click(40, 400);
    }

    await expect(page.locator('#memory-discard'), leave).toBeVisible();
    await expect(page.locator('#memory-actions'), leave).toBeHidden();
    /* The safe answer takes focus, because the question is only asked when there is something
       to lose. */
    expect(await page.evaluate(() => document.activeElement.id), leave).toBe('memory-discard-keep');

    await page.locator('#memory-discard-keep').click();
    await expect(page.locator('#memory-dialog'), leave).toBeVisible();
    await expect(page.locator('#memory-title'), leave).toHaveValue('Worth keeping');
  }

  await page.locator('#memory-cancel').click();
  await page.locator('#memory-discard-confirm').click();
  await expect(page.locator('#memory-dialog')).toBeHidden();
  await expect(page.locator('.memory-list li')).toHaveCount(0);
});

test('adding a photo or a tag is enough to count as a change', async ({ page }) => {
  await startClean(page);
  await page.goto(BASE);
  await openAdd(page);

  await page.locator('#memory-tags').click();
  await page.locator('#memory-tags').type('something');
  await page.keyboard.press('Enter');

  await page.locator('#memory-cancel').click();
  await expect(page.locator('#memory-discard')).toBeVisible();
  await page.locator('#memory-discard-confirm').click();

  await openAdd(page);
  await addPhotoThrough(page, 'paste');
  await expect(page.locator('#memory-photos img')).toHaveCount(1);

  await page.locator('#memory-cancel').click();
  await expect(page.locator('#memory-discard')).toBeVisible();
});

/* Normalizing is what makes the question honest: asked over a difference that could never
   reach the record, it teaches people to press Discard without reading. */
test('whitespace the store would trim is not a change', async ({ page }) => {
  await startClean(page, [memory('only', 'Already saved', '2025-01-01', -1.29, 36.82, ['trail'])]);
  await openApp(page);

  await openDetail(page);
  await page.locator('#detail-edit').click();
  await page.locator('#memory-title').fill('  Already saved  ');
  await page.locator('#memory-cancel').click();

  await expect(page.locator('#memory-dialog')).toBeHidden();
});

test('the import preview is clearly in front of Settings', async ({ page }) => {
  await seedLibrary(page, LIBRARY);
  await openApp(page);

  await page.locator('#open-settings').click();
  await expect(page.locator('#settings-dialog')).toBeVisible();

  await page.locator('#import-input').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'waypoints-export',
        version: 1,
        exportedAt: '2026-01-01T00:00:00.000Z',
        memories: [memory('imported', 'From a file', '2024-02-02', -1.3, 36.9, ['x'])],
        photos: []
      })
    )
  });

  await expect(page.locator('#import-dialog')).toBeVisible();
  await expect(page.locator('#settings-dialog')).toBeVisible();

  /* The preview used to be the same width, in the same place, with the same shadow and the
     same scrim as the panel under it, so the two read as one. */
  const layering = await page.evaluate(() => {
    const importDialog = document.getElementById('import-dialog');
    const settings = document.getElementById('settings-dialog');
    return {
      importScrim: getComputedStyle(importDialog, '::backdrop').backgroundColor,
      settingsScrim: getComputedStyle(settings, '::backdrop').backgroundColor,
      importShadow: getComputedStyle(importDialog).boxShadow,
      settingsShadow: getComputedStyle(settings).boxShadow
    };
  });

  expect(layering.importScrim).not.toBe(layering.settingsScrim);
  expect(layering.importShadow).not.toBe(layering.settingsShadow);

  /* Focus behaviour is unchanged: cancelling the preview returns to Settings, still open. */
  await page.locator('#import-cancel').click();
  await expect(page.locator('#import-dialog')).toBeHidden();
  await expect(page.locator('#settings-dialog')).toBeVisible();
});

/* ---- the one exit the dialog cannot intercept -------------------------------- */

/* beforeunload is the browser's own question and the only way to see it is to ask the browser
   to leave. page.close({ runBeforeUnload: true }) is that: without the flag Playwright closes
   the page without running the handler at all, and the test would pass whether or not one was
   ever registered.

   Chromium only. WebKit does not surface the dialog to Playwright, which is a harness limit
   rather than anything about the app, and the handler's own lifecycle - added on open, removed
   on close - is what the two tests below are really about. */
const beforeUnloadIsVisible = (browserName) =>
  browserName === 'chromium'
    ? false
    : 'Playwright does not surface a beforeunload dialog on this engine';

test('a dirty form asks the browser before the tab goes', async ({ context, browserName }) => {
  test.skip(Boolean(beforeUnloadIsVisible(browserName)), beforeUnloadIsVisible(browserName) || '');

  const page = await context.newPage();
  await startClean(page);
  await page.goto(BASE);
  await openAdd(page);
  await page.locator('#memory-title').fill('Half a memory');

  const asked = new Promise((resolve) => {
    page.on('dialog', (dialog) => {
      resolve(dialog.type());
      return dialog.dismiss();
    });
  });

  await page.close({ runBeforeUnload: true });

  expect(await asked).toBe('beforeunload');
});

test('a form that has been closed asks nothing', async ({ context, browserName }) => {
  test.skip(Boolean(beforeUnloadIsVisible(browserName)), beforeUnloadIsVisible(browserName) || '');

  const page = await context.newPage();
  await startClean(page);
  await page.goto(BASE);
  await openAdd(page);
  await page.locator('#memory-title').fill('Half a memory');

  /* Out through the guard, which is the path that has to take the listener with it. */
  await page.locator('#memory-cancel').click();
  await page.locator('#memory-discard-confirm').click();
  await expect(page.locator('#memory-dialog')).toBeHidden();

  let asked = null;
  page.on('dialog', (dialog) => {
    asked = dialog.type();
    return dialog.dismiss();
  });

  await page.close({ runBeforeUnload: true });
  /* A beforeunload dialog arrives within a frame of the close; this is well past that. */
  await new Promise((resolve) => setTimeout(resolve, 1000));

  expect(asked, 'a tab sitting on the map must not ask anything on its way out').toBe(null);
});
