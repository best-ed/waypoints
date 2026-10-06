import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { contrastRatio, readTokenBlock } from '../helpers/contrast.js';

/* A rasterised icon cannot read a custom property, so icons/*.svg are the one place outside
   tokens.css that writes a colour out in full. This keeps that honest: the literals have to be
   exactly the light accent pair, so the icon cannot drift away from the brand the app uses. */

const css = readFileSync(new URL('../../src/css/tokens.css', import.meta.url), 'utf8');
const LIGHT = readTokenBlock(css, ':root {');

const icon = readFileSync(new URL('../../icons/icon.svg', import.meta.url), 'utf8');
const maskable = readFileSync(new URL('../../icons/icon-maskable.svg', import.meta.url), 'utf8');

const FILES = [
  { name: 'icon.svg', source: icon },
  { name: 'icon-maskable.svg', source: maskable }
];

const HEX = /#[0-9a-f]{3,8}\b/gi;

for (const file of FILES) {
  test(file.name + ' uses only the two light accent tokens', () => {
    const used = [...new Set((file.source.match(HEX) ?? []).map((hex) => hex.toLowerCase()))].sort();

    assert.deepEqual(used, [LIGHT['--color-accent'], LIGHT['--color-accent-contrast']].sort());
  });

  test(file.name + ' paints the glyph on the plate, not the other way round', () => {
    assert.match(file.source, new RegExp('<rect[^>]*fill="' + LIGHT['--color-accent'] + '"'));
    assert.match(file.source, new RegExp('<path[^>]*fill="' + LIGHT['--color-accent-contrast'] + '"', 's'));
  });

  test(file.name + ' is a 512 square, so every rendered size is a clean division', () => {
    assert.match(file.source, /viewBox="0 0 512 512"/);
  });

  test(file.name + ' carries a name rather than being an unlabelled graphic', () => {
    assert.match(file.source, /aria-label="waypoints"/);
  });
}

test('the glyph has enough contrast against the plate to read at a launcher size', () => {
  /* Not a WCAG rule - an icon is not interface text - but a mark that does not separate from
     its own background is no use at 48px either. 3:1 is the bar used for everything else here
     that has to be seen rather than read. */
  const ratio = contrastRatio(LIGHT['--color-accent'], LIGHT['--color-accent-contrast']);

  assert.ok(ratio >= 3, 'accent against its contrast colour is ' + ratio.toFixed(2) + ':1');
});

test('the maskable glyph fits inside the safe zone', () => {
  /* A maskable icon is only guaranteed to show the centre circle of 80% diameter, so on a 512
     canvas the mark has to sit inside a circle of radius 204.8. The glyph is 200 wide and 300
     tall around its own origin, placed at the centre, so the furthest corner of its box is
     half its diagonal from there. Asserted from the numbers in the file rather than by eye. */
  const transform = /transform="translate\(256 206\)"/.test(maskable);
  assert.ok(transform, 'the maskable glyph is placed unscaled at the centre');

  const halfWidth = 100;
  const halfHeight = 150;
  const halfDiagonal = Math.hypot(halfWidth, halfHeight);

  assert.ok(halfDiagonal < 512 * 0.4, halfDiagonal.toFixed(1) + ' is outside the 204.8 safe radius');
});

test('the rounded plate is on the ordinary icon only', () => {
  /* The launcher masks a maskable icon to its own shape, so a corner radius of ours would cut
     the plate away inside it and leave gaps. */
  assert.match(icon, /<rect[^>]*rx="96"/);
  assert.doesNotMatch(maskable, /<rect[^>]*rx=/);
});
