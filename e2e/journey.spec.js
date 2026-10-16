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

/* Did the map move. Asked of the map rather than inferred from anything.

   This used to read the map pane's CSS transform and compare it before and after. It does not
   mean what it looks like it means: Leaflet's _resetView begins by setting the pane back to
   0,0 and compensates by repositioning its layers, so the transform changes when nothing
   moved and stays put when things did. Sampling a pin's position instead is worse - the loop
   can decide a position is stable before an animation has even started.

   src/js/dev/map-probe.js counts Leaflet's own movestart, which fires synchronously as any
   setView, flyTo, fitBounds or panTo begins. Zero means no movement was ever started. */
const movesStarted = (page) => page.evaluate(() => window.waypointsMapProbe.movesStarted());

const resetMoves = (page) => page.evaluate(() => window.waypointsMapProbe.reset());

/* A movement has begun. Needed before waiting for one to finish: idle is also what the probe
   says a moment before anything starts, so waiting only for idle after pressing something can
   return before the thing has happened. */
async function waitForMove(page) {
  await page.waitForFunction(() => window.waypointsMapProbe.movesStarted() >= 1, null, {
    timeout: 20000
  });
}

/* Every movement that started has finished. */
async function mapIsStill(page) {
  await page.waitForFunction(() => window.waypointsMapProbe.isIdle(), null, { timeout: 20000 });
}

/* Quiet for a stretch, not merely idle in this instant, and this is where the counting starts
   from.

   A fly does not finish the map's work. Leaflet opens the stop's popup at the end of one, and
   a popup with autoPan pans the map to fit itself in a task scheduled after the fly's own
   moveend - so the probe is honestly idle in between, and a reset there leaves two movements
   to be counted that nobody asked for. Measured: two, every time, with nothing touched at all.

   So this waits for a window with no movement started in it before handing back a zeroed
   counter. The probe still answers the question exactly; this only decides when the question
   starts being asked. */
const QUIET_MS = 600;

async function mapHasSettled(page) {
  await mapIsStill(page);

  for (let attempt = 0; attempt < 20; attempt++) {
    await resetMoves(page);
    await page.waitForTimeout(QUIET_MS);

    if ((await movesStarted(page)) === 0) {
      return;
    }

    await mapIsStill(page);
  }

  throw new Error('the map never stopped moving on its own');
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

  /* Slow, so there is a window to measure in. A journey at Normal flies again every 3.5
     seconds, and under parallel load the map is then never quiet for long enough to start
     counting from. Six seconds leaves room, and the speed control is a real one. */
  await page.locator('[data-speed="slow"]').click();

  await page.locator('#player-play').click();
  await expect(page.locator('#player-play')).toHaveAttribute('aria-label', 'Pause journey');

  /* Playing flies to stop 1, and the popup that lands with it pans again afterwards. Both
     have to be over and the counter zeroed before this test counts anything. */
  await waitForMove(page);
  await mapHasSettled(page);

  /* The list is newest first, so the first card is the last stop in the journey. */
  await page.locator('.memory-list li button').first().click();
  await expect(page.locator('#memory-detail')).toBeVisible();
  /* Opening a memory puts focus on its heading, which is the app saying it has finished. */
  await expect(page.locator('#detail-title')).toBeFocused();

  await expect(page.locator('#player-position')).toHaveText('5 of 5');
  await expect(page.locator('#player-title')).toHaveText('Just a plain day');
  await expect(page.locator('#player-play')).toHaveAttribute('aria-label', 'Play journey');

  /* Past the point where a fly started by an async read would have begun. The photos for the
     view are fetched from IndexedDB after the heading takes focus, and a movement kicked off
     by whatever that returned would start after every assertion above had passed. */
  await page.waitForTimeout(1000);

  expect(await movesStarted(page), 'opening a memory must not move the map').toBe(0);
});

/* The two controls above it that are supposed to move the map. Without these the zero in the
   test above says only that the probe is quiet, which a probe wired to nothing also is. */
test('the probe sees Show on map move the map', async ({ page }) => {
  await enterJourney(page);

  await page.locator('.memory-list li button').first().click();
  await expect(page.locator('#memory-detail')).toBeVisible();

  await mapHasSettled(page);

  await page.locator('#detail-show').click();
  await waitForMove(page);
  await mapIsStill(page);

  expect(await movesStarted(page), 'Show on map is the control that moves the map').toBeGreaterThanOrEqual(1);
});

test('the probe sees a playback step move the map', async ({ page }) => {
  await enterJourney(page);

  await mapHasSettled(page);

  await page.locator('#player-next').click();
  await expect(page.locator('#player-position')).toHaveText('2 of 5');
  await waitForMove(page);
  await mapIsStill(page);

  expect(await movesStarted(page), 'a step flies to the next stop').toBeGreaterThanOrEqual(1);
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
