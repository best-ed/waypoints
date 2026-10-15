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

/* ---- the sweep ------------------------------------------------------------- */

/* Every visible interactive element in a state, measured the way a thumb meets it.

   Not getBoundingClientRect: several controls are drawn smaller than 44px on purpose and grow
   a transparent hit box instead, which an element box cannot show. Four points 21px out from
   the centre, on the axes rather than at the corners, because the corner of a 44px box is 29px
   from the centre of a round button and a circle would fail however big it was. */
const REACH = 21;

/* Everything that is interactive but is not a touch target, each with the reason. The list is
   the point: a control added later that is too small has to be argued for here before this
   suite will go green. */
const EXEMPT = [
  {
    selector: '.skip-link',
    why: 'off screen until it takes focus, and reached by keyboard only'
  },
  {
    selector: '.photo-input',
    why: 'visually hidden; the label in front of it is the target and is swept'
  },
  {
    selector: '.leaflet-control-attribution a',
    why: "OpenStreetMap's own credit line, whose size is set by the licence it satisfies"
  },
  {
    selector: '.leaflet-marker-icon',
    why: 'anchored at its point, so its hit box is centred on its head rather than on its own middle; measured by the pin test below, which knows where to aim'
  }
];

const EXEMPT_SELECTOR = EXEMPT.map((entry) => entry.selector).join(', ');

const INTERACTIVE =
  'a[href], button, input, select, textarea, summary, [role="button"], [role="option"], [role="switch"], [tabindex]:not([tabindex="-1"])';

async function undersized(page) {
  return page.evaluate(
    ([selector, exempt, reach]) => {
      const bad = [];

      const name = (node) => {
        const id = node.id ? '#' + node.id : '';
        const cls =
          typeof node.className === 'string' && node.className
            ? '.' + node.className.trim().split(/\s+/).slice(0, 2).join('.')
            : '';
        const label = (node.getAttribute('aria-label') || node.textContent || '').trim().slice(0, 30);
        return node.tagName.toLowerCase() + id + cls + (label ? ' "' + label + '"' : '');
      };

      const shown = (node) => {
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
          return false;
        }
        const rect = node.getBoundingClientRect();
        /* Off the bottom of a scroller is still a target; off the viewport entirely is not
           something a thumb can reach without scrolling to it first. */
        return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
      };

      /* A modal dialog makes everything behind it inert, and inert is the correct answer for
         those controls rather than a fault: elementFromPoint lands on the dialog, as a thumb
         would. So when one is open, only what is inside it is swept. */
      const modal = [...document.querySelectorAll('dialog[open]')].pop();
      const root = modal ?? document;

      for (const node of root.querySelectorAll(selector)) {
        if (!shown(node) || (exempt && node.matches(exempt))) {
          continue;
        }

        const rect = node.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;

        const reachable = [
          [-reach, 0],
          [reach, 0],
          [0, -reach],
          [0, reach]
        ].every(([dx, dy]) => {
          const hit = document.elementFromPoint(x + dx, y + dy);
          return Boolean(hit) && (hit === node || node.contains(hit));
        });

        if (!reachable) {
          bad.push(name(node) + ' is ' + Math.round(rect.width) + 'x' + Math.round(rect.height));
        }
      }

      return bad;
    },
    [INTERACTIVE, EXEMPT_SELECTOR, REACH]
  );
}

const STATES = {
  async 'the map'(page) {
    await openMap(page);
  },

  async 'the list'(page) {
    await seedLibrary(page);
    await openApp(page);
    await page.locator('#view-list').click();
  },

  async 'a memory'(page) {
    await seedLibrary(page);
    await openApp(page);
    await page.locator('#view-list').click();
    await page.locator('.memory-list li button').first().click();
    await expect(page.locator('#memory-detail')).toBeVisible();
  },

  async 'the add dialog'(page) {
    await seedSettings(page, { suggestPlaceNames: false });
    await seedLibrary(page, []);
    await openApp(page);
    await page.locator('#view-map').click();
    await page.locator('#add-memory').click();
    const map = await page.locator('#map').boundingBox();
    await page.mouse.click(map.x + map.width * 0.5, map.y + map.height * 0.5);
    await expect(page.locator('#memory-dialog')).toBeVisible();
  },

  async settings(page) {
    await openMap(page);
    await page.locator('#open-settings').click();
    await expect(page.locator('#settings-dialog')).toBeVisible();
  },

  async 'the journey player'(page) {
    await seedLibrary(page);
    await openApp(page);
    await page.locator('#view-list').click();
    await page.locator('#journey-toggle').click();
    await page.locator('#view-map').click();
    await expect(page.locator('#journey-player')).toBeVisible();
  },

  async 'the place search open'(page) {
    await openMap(page);
    await page.locator('.place-search-toggle').click();
    await expect(page.locator('.place-search-panel')).toBeVisible();
  }
};

for (const [state, reach] of Object.entries(STATES)) {
  test('every target in ' + state + ' can be hit with a thumb', async ({ page }) => {
    await reach(page);
    /* Transitions move things, and a control caught mid-slide is measured where it is not. */
    await page.waitForTimeout(400);

    expect(await undersized(page), 'undersized targets, or add them to EXEMPT with a reason').toEqual([]);
  });
}

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
