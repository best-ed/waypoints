import { test, expect, openApp, seedLibrary, seedSettings, mockNominatim } from './fixtures.js';

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

test('the small icon buttons in the detail view are full size on touch', async ({ page }) => {
  await seedLibrary(page);
  await openApp(page);
  await page.locator('#view-list').click();
  await page.locator('.memory-list li button').first().click();
  await expect(page.locator('#memory-detail')).toBeVisible();

  for (const id of ['#detail-previous', '#detail-next']) {
    const box = await page.locator(id).boundingBox();
    expect(box.width, id + ' is ' + Math.round(box.width) + 'px wide').toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});

/* Every target a thumb has to hit, measured as a thumb would: a 44px box centred on the
   control, with all four of its corners resolving to that control. Several of these are drawn
   smaller than 44px on purpose - a switch at 44px square is not a switch - and grow their hit
   area instead, which an element box cannot show. */
const TOUCHABLE = [
  '#view-map',
  '#view-list',
  '#add-memory',
  '#open-settings',
  '.place-search-toggle',
  '.leaflet-control-zoom-in',
  '.leaflet-control-zoom-out'
];

test('the controls on the map can be hit with a thumb', async ({ page }) => {
  await openMap(page);

  const tooSmall = await page.evaluate((selectors) => {
    const bad = [];

    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (!node) {
        bad.push(selector + ': not found');
        continue;
      }

      const rect = node.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      /* On the axes, not at the corners. Several of these are circles, and the corner of a
         44px box is 29px from the centre of a 22px circle: a round button would fail a corner
         test however big it was. Four points at 21px still prove 42px of reach each way. */
      const reach = 21;

      for (const [dx, dy] of [
        [-reach, 0],
        [reach, 0],
        [0, -reach],
        [0, reach]
      ]) {
        const hit = document.elementFromPoint(x + dx, y + dy);
        /* The control itself or something inside it. An ancestor does not count: landing on
           the container a control sits in is landing next to the control. */
        if (!hit || !(hit === node || node.contains(hit))) {
          bad.push(selector + ': ' + Math.round(rect.width) + 'x' + Math.round(rect.height));
          break;
        }
      }
    }

    return bad;
  }, TOUCHABLE);

  expect(tooSmall).toEqual([]);
});

test('the settings switches can be hit with a thumb', async ({ page }) => {
  await openMap(page);
  await page.locator('#open-settings').click();
  await expect(page.locator('#settings-dialog')).toBeVisible();

  const tooSmall = await page.evaluate(() => {
    const bad = [];

    for (const node of document.querySelectorAll('#settings-dialog .switch')) {
      const rect = node.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;

      for (const [dx, dy] of [
        [0, -21],
        [0, 21]
      ]) {
        const hit = document.elementFromPoint(x + dx, y + dy);
        if (hit !== node) {
          bad.push(node.id + ': ' + Math.round(rect.width) + 'x' + Math.round(rect.height));
          break;
        }
      }
    }

    return bad;
  });

  expect(tooSmall).toEqual([]);
});

/* The pin is drawn at 26x34 and has to stay that size: a marker big enough to be a comfortable
   target covers the place it is marking. The hit area is grown around it instead. */
test('a map pin can be hit with a thumb without being drawn any bigger', async ({ page }) => {
  await openMap(page);

  const pin = page.locator('.leaflet-marker-icon.pin').first();
  const box = await pin.boundingBox();

  expect(Math.round(box.width)).toBeLessThan(44);

  const reachable = await page.evaluate(() => {
    const node = document.querySelector('.leaflet-marker-icon.pin');
    const rect = node.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    /* The hit box is centred on the head, which is what a thumb aims at, not on the point. */
    const y = rect.top + rect.height * 0.4;

    return [
      [-21, 0],
      [21, 0],
      [0, -21],
      [0, 21]
    ].every(([dx, dy]) => {
      const hit = document.elementFromPoint(x + dx, y + dy);
      return hit === node || node.contains(hit);
    });
  });

  expect(reachable).toBe(true);
});

/* The bigger catchment must not swallow the map itself. */
test('the map still takes a tap between the pins', async ({ page }) => {
  /* Placing a pin reverse geocodes it, and this test is about the tap landing, not about a
     lookup it never asked for. */
  await seedSettings(page, { suggestPlaceNames: false });
  await openMap(page);
  await page.locator('#add-memory').click();

  const map = await page.locator('#map').boundingBox();
  /* A corner of the pane, well clear of any seeded pin. */
  await page.mouse.click(map.x + 30, map.y + map.height - 80);

  await expect(page.locator('#memory-dialog')).toBeVisible();
});
