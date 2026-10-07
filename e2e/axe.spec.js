import AxeBuilder from '@axe-core/playwright';

import {
  test,
  expect,
  openApp,
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

  async 'add dialog'(page) {
    /* Placing a pin reverse geocodes it, so the response is mocked rather than the feature
       being switched off: the hint and the filled place name are part of what is audited. */
    await mockNominatim(page);
    /* No memories: at 1280 the seeded pins sit under the middle of the map, so a click there
       opened a marker popup instead of placing anything. The dialog is what is being audited. */
    await seedLibrary(page, []);
    await page.goto(BASE);
    await page.locator('#add-memory').click();
    const box = await page.locator('#map').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator('#memory-dialog')).toBeVisible();
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
    if (narrow) await page.locator('#view-list').click();
    await page.locator('.memory-list li button').first().click();
    await page.locator('.leaflet-popup button', { hasText: 'Edit' }).click();
    await page.locator('#memory-photo-input').setInputFiles({
      name: 'generated.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from(jpeg, 'base64')
    });
    await expect(page.locator('#memory-photos img')).toHaveCount(1);
    await page.locator('#memory-save').click();
    await expect(page.locator('#memory-dialog')).toBeHidden();

    if (narrow) await page.locator('#view-list').click();
    await page.locator('.memory-list li button').first().click();
    await page.locator('.popup-photo-button').first().click();
    await expect(page.locator('#lightbox')).toBeVisible();
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
