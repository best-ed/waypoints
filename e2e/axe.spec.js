import AxeBuilder from '@axe-core/playwright';

import {
  test,
  expect,
  openApp,
  openDetail,
  openPopup,
  seedLibrary,
  mockNominatim,
  generatePhotoBytes,
  memory,
  BASE
} from './fixtures.js';

/* axe over the states that are hard to reach by hand, in both themes and at both widths. The
   scratchpad runs a wider sweep including forced colours; this is the part that is worth having
   in CI, where a regression would otherwise reach the deployed site. */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];

const WIDTHS = [
  { label: '1280', width: 1280, height: 900 },
  { label: '375', width: 375, height: 760 }
];

const THEMES = ['light', 'dark'];

async function analyse(page) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();

  /* Named, so a failure says which rule and where rather than just a count. */
  return results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.length,
    target: violation.nodes[0]?.target?.join(' ')
  }));
}

/* Each state leaves the page in the shape being audited. */
const STATES = {
  async default(page) {
    await seedLibrary(page);
    await openApp(page);
  },

  async 'add dialog'(page, { narrow }) {
    /* Placing a pin reverse geocodes it, so the response is mocked rather than the feature
       being switched off: the hint and the filled place name are part of what is audited. */
    await mockNominatim(page);
    /* No memories: at 1280 the seeded pins sit under the middle of the map, so a click there
       opened a marker popup instead of placing anything. The dialog is what is being audited. */
    await seedLibrary(page, []);
    await page.goto(BASE);
    /* An empty library opens on the List pane at narrow, because that is where the welcome
       is. Placing a pin means being on the map. */
    if (narrow) await page.locator('#view-map').click();
    await page.locator('#add-memory').click();
    const box = await page.locator('#map').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator('#memory-dialog')).toBeVisible();
  },

  /* Nothing saved yet: the welcome block, with the search, the filters and the journey all
     gone. A state nobody reaches twice, and the one that decides whether they come back. */
  async 'first run'(page) {
    await seedLibrary(page, []);
    await page.goto(BASE);
    await expect(page.locator('#welcome')).toBeVisible();
  },

  /* The filter controls are behind a disclosure now, so axe never saw them unless something
     opened it. */
  async 'filters expanded'(page, { narrow }) {
    await seedLibrary(page);
    await openApp(page);
    if (narrow) await page.locator('#view-list').click();
    await page.locator('#filters-toggle').click();
    await expect(page.locator('#filters-panel')).toBeVisible();
    /* With a tag on there is also a removable chip and a Clear all to audit. */
    await page.locator('.tag-chip').first().click();
    await expect(page.locator('#active-filters .chip-removable')).toHaveCount(1);
  },

  async settings(page) {
    await seedLibrary(page);
    await openApp(page);
    await page.locator('#open-settings').click();
    await expect(page.locator('#settings-dialog')).toBeVisible();
  },

  async lightbox(page, { narrow }) {
    await seedLibrary(page, [memory('a', 'Photo memory', '2025-01-01', -1.29, 36.82, ['x'])]);
    await openApp(page);

    const jpeg = await generatePhotoBytes(page);
    await openDetail(page, { narrow });
    await page.locator('#detail-edit').click();
    await page.locator('#memory-photo-input').setInputFiles({
      name: 'generated.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from(jpeg, 'base64')
    });
    await expect(page.locator('#memory-photos img')).toHaveCount(1);
    await page.locator('#memory-save').click();
    await expect(page.locator('#memory-dialog')).toBeHidden();

    await page.locator('.detail-hero-button').click();
    await expect(page.locator('#lightbox')).toBeVisible();
  },

  /* The state that shipped broken in 1.0.0. Leaflet paints the popup wrapper white from its
     own stylesheet, so in the dark theme the title and the note sat at 1.18:1 and the date at
     2.75:1. axe's colour-contrast rule reads the painted background, which is what makes this
     the right place to catch it: nothing about the tokens was wrong. */
  async 'open popup'(page, { narrow }) {
    await seedLibrary(page, [
      memory('p', 'Ridge trail at the long rains', '2025-01-01', -1.29, 36.82, ['trail', 'rain'], {
        note: 'Walked up from the gate in the afternoon and the cloud came in about an hour later.',
        placeName: 'Ngong Hills, Kajiado'
      })
    ]);
    await openApp(page);

    const jpeg = await generatePhotoBytes(page);
    await openDetail(page, { narrow });
    await page.locator('#detail-edit').click();
    await page.locator('#memory-photo-input').setInputFiles({
      name: 'generated.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from(jpeg, 'base64')
    });
    await expect(page.locator('#memory-photos img')).toHaveCount(1);
    await page.locator('#memory-save').click();
    await expect(page.locator('#memory-dialog')).toBeHidden();

    await page.locator('#detail-back').click();
    await openPopup(page, { narrow });
    /* The cover is filled lazily from Leaflet's contentupdate, so the popup is not finished
       the moment it appears. */
    await expect(page.locator('.popup-cover-image')).toBeVisible();
  },

  async journey(page, { narrow }) {
    await seedLibrary(page);
    await openApp(page);
    if (narrow) await page.locator('#view-list').click();
    await page.locator('#journey-toggle').click();
    await expect(page.locator('#journey-controls')).toBeVisible();
    await page.locator('#journey-play').click();
    await expect(page.locator('#journey-progress')).toContainText('1');
  }
};

/* Nothing is switched off. 1.0.1 had to turn skip-link off for the open popup, because
   Leaflet builds its close control as <a href="#close"> and "#close" matches no element; the
   popup carries a real button now, so the exemption is gone and the state passes without it. */

for (const [name, reach] of Object.entries(STATES)) {
  for (const theme of THEMES) {
    for (const size of WIDTHS) {
      test(`axe: ${name}, ${theme}, ${size.label}`, async ({ page }) => {
        await page.setViewportSize({ width: size.width, height: size.height });
        await page.emulateMedia({ colorScheme: theme });

        await reach(page, { narrow: size.width <= 720 });

        const violations = await analyse(page);
        expect(violations, JSON.stringify(violations, null, 1)).toEqual([]);
      });
    }
  }
}

/* axe is not enough for this one, and that is worth stating.

   The popup floats over the map, so axe cannot be sure what is painted behind the text and
   reports colour-contrast as *incomplete* rather than as a violation. Run against the broken
   1.0.0 stylesheet the open-popup state above passes clean. So the contrast is measured here
   directly: walk up for the first ancestor that actually paints a background, and compare.
   That is what a reader sees, and it is what 1.0.0 got wrong. */
for (const theme of THEMES) {
  test(`the popup's own text is readable against what is painted behind it, ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ colorScheme: theme });

    await seedLibrary(page, [
      memory('p', 'Ridge trail at the long rains', '2025-01-01', -1.29, 36.82, ['trail'], {
        note: 'Walked up from the gate in the afternoon and the cloud came in about an hour later.',
        placeName: 'Ngong Hills, Kajiado'
      })
    ]);
    await openApp(page);
    await openPopup(page);

    const measured = await page.evaluate(() => {
      const channel = (value) => {
        const c = value / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      };
      const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      const parse = (value) => value.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
      const ratio = (a, b) => {
        const [x, y] = [luminance(parse(a)), luminance(parse(b))].sort((p, q) => q - p);
        return (x + 0.05) / (y + 0.05);
      };

      const painted = (node) => {
        for (let el = node; el && el !== document.documentElement; el = el.parentElement) {
          const background = getComputedStyle(el).backgroundColor;
          if (background && !background.startsWith('rgba(0, 0, 0, 0)') && background !== 'transparent') {
            return background;
          }
        }
        return null;
      };

      return ['.popup-title', '.popup-meta'].map((selector) => {
        const node = document.querySelector(selector);
        if (!node) return { selector, missing: true };
        const background = painted(node);
        const colour = getComputedStyle(node).color;
        return {
          selector,
          colour,
          background,
          ratio: background ? Number(ratio(colour, background).toFixed(2)) : null
        };
      });
    });

    for (const entry of measured) {
      expect(entry.missing, entry.selector + ' is not in the popup').toBeFalsy();
      expect(entry.background, entry.selector + ' sits on nothing painted').toBeTruthy();
      expect(entry.ratio, JSON.stringify(entry)).toBeGreaterThanOrEqual(4.5);
    }
  });
}

test('the page keeps exactly one main landmark however it is laid out', async ({ page }) => {
  /* The regression that got through once: at 375px the map pane is hidden, and when main
     wrapped only the map the document lost its only main landmark. */
  await seedLibrary(page);
  await openApp(page);

  for (const size of WIDTHS) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.locator('main')).toBeVisible();
  }

  await page.locator('#view-list').click();
  await expect(page.locator('main')).toBeVisible();
});

test('the skip link comes first and reaches the list', async ({ page, browserName }) => {
  await seedLibrary(page);
  await page.goto(BASE);

  /* Asserted from the document rather than by tabbing, because Safari leaves links out of the
     tab order unless full keyboard access is switched on - a platform default, not something
     the markup can change. The order itself is what has to be right. */
  const first = await page.evaluate(() => {
    const focusable = document.querySelectorAll(
      'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const element = focusable[0];
    return { className: element.className, href: element.getAttribute('href') };
  });

  expect(first.className).toContain('skip-link');
  expect(first.href).toBe('#memory-list');

  /* And it does what it says: focus ends up somewhere focus can actually land. */
  await page.locator('.skip-link').focus();
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => document.activeElement.id)).toBe('memory-list');

  if (browserName === 'chromium') {
    await page.goto(BASE);
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement.className)).toContain('skip-link');
  }
});
