import { test, expect, openApp, seedLibrary } from './fixtures.js';

/* The player: the transport, the scrubber, the speed, what happens when a memory is opened
   underneath it, and the end of the journey. The smoke suite still covers entering and leaving
   journey mode; these are the paths that only exist now there is a player to drive. */

async function enterJourney(page, { narrow = false } = {}) {
  await seedLibrary(page);
  await openApp(page);

  if (narrow) {
    /* The toggle is in the sidebar, which at this width means the List pane. The player is in
       the other one, so there is nothing to assert here until the map is showing. */
    await page.locator('#view-list').click();
    await page.locator('#journey-toggle').click();
    return;
  }

  await page.locator('#journey-toggle').click();
  await expect(page.locator('#journey-player')).toBeVisible();
}

/* Where the map is, once it has stopped moving. focusMarker flies, and a transform read
   mid-flight is a moment in an animation rather than a position.

   Three equal reads in a row, not two: under parallel load on WebKit a fly can stall long
   enough between two reads to look finished and then carry on, which is exactly how this read
   a position that was still an animation. */
async function settledTransform(page) {
  const read = () =>
    page.evaluate(() => document.querySelector('.leaflet-map-pane')?.style.transform ?? '');

  let previous = await read();
  let stable = 0;

  for (let attempt = 0; attempt < 40; attempt++) {
    await page.waitForTimeout(300);
    const current = await read();

    stable = current === previous ? stable + 1 : 0;
    previous = current;

    if (stable >= 2) {
      return current;
    }
  }

  return previous;
}

test('the player names the stop it is on, by title and date', async ({ page }) => {
  await enterJourney(page);

  /* Oldest first, the opposite of the list: a journey is walked forwards in time. */
  await expect(page.locator('#player-title')).toHaveText('Karura forest walk');
  await expect(page.locator('#player-meta')).toContainText('2023');
  await expect(page.locator('#player-position')).toHaveText('1 of 5');
});

test('Next and Previous step the stops and stop at the ends', async ({ page }) => {
  await enterJourney(page);

  await expect(page.locator('#player-previous')).toHaveAttribute('aria-disabled', 'true');

  await page.locator('#player-next').click();
  await expect(page.locator('#player-position')).toHaveText('2 of 5');
  await expect(page.locator('#player-title')).toHaveText('Mombasa old town');
  await expect(page.locator('#player-previous')).toHaveAttribute('aria-disabled', 'false');

  await page.locator('#player-previous').click();
  await expect(page.locator('#player-position')).toHaveText('1 of 5');

  /* Playwright refuses to click an aria-disabled element, so the press at the end has to be
     dispatched. What is being asserted is that nothing happens. */
  await page.locator('#player-previous').dispatchEvent('click');
  await expect(page.locator('#player-position')).toHaveText('1 of 5');
});

test('the scrubber moves the journey and says where it is', async ({ page }) => {
  await enterJourney(page);

  const scrubber = page.locator('#player-scrubber');

  await expect(scrubber).toHaveAttribute('max', '4');
  await expect(scrubber).toHaveValue('0');

  await scrubber.fill('3');

  await expect(page.locator('#player-position')).toHaveText('4 of 5');
  await expect(page.locator('#player-title')).toHaveText('Nairobi rooftop sunset');

  /* Chromium ignores aria-valuetext on a native range, which is why the same text is also in
     a live region the input points at. Both are asserted, because both are what make this
     reach a screen reader on every engine. */
  await expect(scrubber).toHaveAttribute(
    'aria-valuetext',
    /^Stop 4 of 5: Nairobi rooftop sunset, /
  );
  await expect(page.locator('#player-announce')).toContainText('Stop 4 of 5');
  await expect(scrubber).toHaveAttribute('aria-describedby', 'player-announce');
});

test('arrowing the scrubber steps one stop', async ({ page }) => {
  await enterJourney(page);

  await page.locator('#player-scrubber').focus();
  await page.keyboard.press('ArrowRight');

  await expect(page.locator('#player-position')).toHaveText('2 of 5');

  await page.keyboard.press('ArrowLeft');

  await expect(page.locator('#player-position')).toHaveText('1 of 5');
});

test('the scrubber has a tick per stop while there are few enough to land on', async ({ page }) => {
  await enterJourney(page);

  await expect(page.locator('#player-ticks option')).toHaveCount(5);
});

test('dragging the scrubber pauses playback', async ({ page }) => {
  await enterJourney(page);

  await page.locator('#player-play').click();
  await expect(page.locator('#player-play')).toHaveAttribute('aria-label', 'Pause journey');

  await page.locator('#player-scrubber').fill('2');

  await expect(page.locator('#player-play')).toHaveAttribute('aria-label', 'Play journey');
  await expect(page.locator('#player-position')).toHaveText('3 of 5');
});

test('the speed control is one choice at a time and starts at Normal', async ({ page }) => {
  await enterJourney(page);

  const slow = page.locator('[data-speed="slow"]');
  const normal = page.locator('[data-speed="normal"]');

  await expect(normal).toHaveAttribute('aria-pressed', 'true');

  await slow.click();

  await expect(slow).toHaveAttribute('aria-pressed', 'true');
  await expect(normal).toHaveAttribute('aria-pressed', 'false');
});

/* Fast is 2s against Normal's 3.5s. Asserted as a thing that happens rather than as a number:
   what matters is that the choice reaches the dwell at all. */
test('Fast advances the journey sooner than Normal would', async ({ page }) => {
  await enterJourney(page);

  await page.locator('[data-speed="fast"]').click();
  await page.locator('#player-play').click();

  await expect(page.locator('#player-position')).toHaveText('2 of 5', { timeout: 3000 });
});

test('the speed goes back to Normal when the journey is left', async ({ page }) => {
  await enterJourney(page);

  await page.locator('[data-speed="fast"]').click();
  await page.locator('#journey-toggle').click();
  await page.locator('#journey-toggle').click();

  await expect(page.locator('[data-speed="normal"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-speed="fast"]')).toHaveAttribute('aria-pressed', 'false');
});

test('the journey draws two polylines, not one per leg', async ({ page }) => {
  await enterJourney(page);

  /* Idle is one line at full strength; a position splits it into travelled and remaining. */
  await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(1);

  await page.locator('#player-next').click();

  await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(2);
});

test('opening a memory moves the playhead to it, paused, without flying the map', async ({ page }) => {
  await enterJourney(page);

  await page.locator('#player-play').click();
  await expect(page.locator('#player-play')).toHaveAttribute('aria-label', 'Pause journey');

  const before = await settledTransform(page);

  /* The list is newest first, so the first card is the last stop in the journey. */
  await page.locator('.memory-list li button').first().click();
  await expect(page.locator('#memory-detail')).toBeVisible();

  await expect(page.locator('#player-position')).toHaveText('5 of 5');
  await expect(page.locator('#player-title')).toHaveText('Just a plain day');
  await expect(page.locator('#player-play')).toHaveAttribute('aria-label', 'Play journey');

  expect(await settledTransform(page)).toBe(before);
});

test('closing the detail view leaves the journey where it was', async ({ page }) => {
  await enterJourney(page);

  await page.locator('.memory-list li button').nth(1).click();
  await expect(page.locator('#memory-detail')).toBeVisible();

  const position = await page.locator('#player-position').textContent();

  await page.locator('#detail-back').click();
  await expect(page.locator('#memory-detail')).toBeHidden();

  await expect(page.locator('#journey-player')).toBeVisible();
  expect(await page.locator('#player-position').textContent()).toBe(position);
});

test('the player and the detail view share the screen on a wide one', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await enterJourney(page);

  await page.locator('.memory-list li button').first().click();

  await expect(page.locator('#memory-detail')).toBeVisible();
  await expect(page.locator('#journey-player')).toBeVisible();
});

test('the player goes with the map pane on a narrow screen and comes back with it', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 760 });
  await enterJourney(page, { narrow: true });

  await page.locator('#view-map').click();
  await expect(page.locator('#journey-player')).toBeVisible();

  await page.locator('#view-list').click();
  await page.locator('.memory-list li button').first().click();
  await expect(page.locator('#memory-detail')).toBeVisible();
  await expect(page.locator('#journey-player')).toBeHidden();

  await page.locator('#detail-back').click();
  await page.locator('#view-map').click();

  await expect(page.locator('#journey-player')).toBeVisible();
});

async function playToTheEnd(page) {
  const scrubber = page.locator('#player-scrubber');

  /* Scrubbed to the last stop rather than stepped there: Next is aria-disabled at the end. */
  await scrubber.fill(await scrubber.getAttribute('max'));
  await page.locator('#player-play').click();

  await expect(page.locator('#player-end')).toBeVisible({ timeout: 10000 });
}

test('the end card says what the journey was and takes focus to Replay', async ({ page }) => {
  await enterJourney(page);
  await playToTheEnd(page);

  await expect(page.locator('#player-end-summary')).toContainText('5 memories');
  await expect(page.locator('#player-end-summary')).toContainText('km');
  await expect(page.locator('#player-replay')).toBeFocused();
});

test('Replay starts the journey over from the first stop', async ({ page }) => {
  await enterJourney(page);
  await playToTheEnd(page);

  await page.locator('#player-replay').click();

  await expect(page.locator('#player-position')).toHaveText('1 of 5');
  await expect(page.locator('#player-end')).toBeHidden();
});

/* The leak, observed rather than counted: Leaflet schedules dozens of timers and lets most of
   them fire, so counting says nothing. What is asserted is the thing a leaked dwell would
   actually do, which is keep advancing a journey that has been left. */
test('Exit from the end card leaves no dwell timer behind', async ({ page }) => {
  await enterJourney(page);
  await playToTheEnd(page);

  await page.locator('#player-exit').click();

  await expect(page.locator('#journey-player')).toBeHidden();
  await expect(page.locator('.pin-journey')).toHaveCount(0);

  /* Past two dwells at the default speed. */
  await page.waitForTimeout(8000);

  await expect(page.locator('#journey-player')).toBeHidden();
  await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(0);
});

test('the sidebar keeps only the way in', async ({ page }) => {
  await seedLibrary(page);
  await openApp(page);

  await expect(page.locator('#journey-toggle')).toBeVisible();
  await expect(page.locator('#journey-player')).toBeHidden();

  await page.locator('#journey-toggle').click();

  /* The transport used to live here. What the sidebar keeps is the toggle and its reason. */
  await expect(page.locator('.sidebar #journey-player')).toHaveCount(0);
  await expect(page.locator('.app-main #journey-player')).toBeVisible();
});
