import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { contrastRatio, parseHex, readTokenBlock } from '../helpers/contrast.js';

const css = readFileSync(new URL('../../src/css/tokens.css', import.meta.url), 'utf8');

const LIGHT = readTokenBlock(css, ':root {');
const DARK = readTokenBlock(css, ":root[data-theme='dark']");
const DARK_MEDIA = readTokenBlock(css, ":root:not([data-theme='light'])");

/* Every colour pairing the interface actually puts together, with the ratio it has to meet.
   The list is explicit on purpose: a new colour token has to be added here with a decision
   attached, rather than quietly shipping untested.

   4.5 is body text. 3.0 is large text and the things WCAG 1.4.11 calls user interface
   components - control boundaries, focus rings, the pins and bars that carry meaning.
   1.0 marks a pairing with no requirement, and each of those says why. */
const PAIRINGS = [
  // --- body text ---------------------------------------------------------------
  { fg: '--color-text', bg: '--color-bg', ratio: 4.5, what: 'body text on the page' },
  { fg: '--color-text', bg: '--color-surface', ratio: 4.5, what: 'body text on a panel' },
  { fg: '--color-text-muted', bg: '--color-bg', ratio: 4.5, what: 'hints and meta on the page' },
  { fg: '--color-text-muted', bg: '--color-surface', ratio: 4.5, what: 'hints and meta on a panel' },
  { fg: '--color-text', bg: '--color-surface-raised', ratio: 4.5, what: 'body text on a floating control' },
  { fg: '--color-text-muted', bg: '--color-surface-raised', ratio: 4.5, what: 'hints on a floating control' },
  { fg: '--color-text', bg: '--color-surface-overlay', ratio: 4.5, what: 'body text in a dialog or a map popup' },
  { fg: '--color-text-muted', bg: '--color-surface-overlay', ratio: 4.5, what: 'the date and place line in a map popup' },

  // --- text on a filled surface ------------------------------------------------
  { fg: '--color-accent-contrast', bg: '--color-accent', ratio: 4.5, what: 'label on a pressed button or selected chip' },
  { fg: '--color-journey-contrast', bg: '--color-journey', ratio: 4.5, what: 'label on the journey toggle when on' },
  { fg: '--color-sandbox-contrast', bg: '--color-sandbox', ratio: 4.5, what: 'the sandbox banner' },

  // --- accent and journey used as text ----------------------------------------
  { fg: '--color-accent', bg: '--color-surface', ratio: 4.5, what: 'accent text on a panel' },
  { fg: '--color-accent', bg: '--color-surface-overlay', ratio: 4.5, what: 'the selected title in a dialog or popup' },
  { fg: '--color-accent', bg: '--color-bg', ratio: 4.5, what: 'accent text on the page' },
  { fg: '--color-journey', bg: '--color-surface', ratio: 4.5, what: 'the journey summary line' },

  // --- user interface components ----------------------------------------------
  { fg: '--color-border-strong', bg: '--color-surface', ratio: 3, what: 'the edge of an input or button on a panel' },
  { fg: '--color-border-strong', bg: '--color-bg', ratio: 3, what: 'the edge of an input or button on the page' },
  { fg: '--color-border-strong', bg: '--color-surface-overlay', ratio: 3, what: 'the edge of a control inside a dialog' },
  { fg: '--color-journey-muted', bg: '--color-surface', ratio: 3, what: 'the untravelled journey line' },

  // --- no requirement ----------------------------------------------------------
  {
    fg: '--color-border',
    bg: '--color-surface',
    ratio: 1,
    what: 'a divider between areas that are already distinguishable by their background, so it carries no requirement'
  },
  {
    fg: '--color-border',
    bg: '--color-bg',
    ratio: 1,
    what: 'the same divider against the page'
  },
  {
    fg: '--color-border',
    bg: '--color-surface-overlay',
    ratio: 1,
    what: 'the edge of a dialog against its own surface, which is a seam and not a boundary anyone has to see'
  }
];

/* Colour tokens that are a plain hex value and therefore have to appear above. Shadows and
   scrims are rgb() with alpha, which has no single ratio to assert: what they sit on is a map
   tile or a photo, not a token. */
function hexTokens(tokens) {
  return Object.keys(tokens).filter(
    (name) => name.startsWith('--color-') && parseHex(tokens[name]) !== null
  );
}

function check(theme, tokens) {
  for (const pairing of PAIRINGS) {
    const fg = tokens[pairing.fg];
    const bg = tokens[pairing.bg];

    assert.ok(fg, theme + ': missing token ' + pairing.fg);
    assert.ok(bg, theme + ': missing token ' + pairing.bg);

    const actual = contrastRatio(fg, bg);
    assert.ok(actual !== null, theme + ': ' + pairing.fg + ' or ' + pairing.bg + ' is not a hex colour');

    assert.ok(
      actual >= pairing.ratio,
      theme +
        ': ' +
        pairing.what +
        ' (' +
        pairing.fg +
        ' ' +
        fg +
        ' on ' +
        pairing.bg +
        ' ' +
        bg +
        ') is ' +
        actual.toFixed(2) +
        ':1, needs ' +
        pairing.ratio +
        ':1'
    );
  }
}

test('tokens.css declares a light set and a dark set', () => {
  assert.ok(LIGHT, 'no :root block found');
  assert.ok(DARK, 'no :root[data-theme="dark"] block found');
  assert.ok(DARK_MEDIA, 'no prefers-color-scheme block found');
});

test('every pairing meets its ratio in the light theme', () => {
  check('light', LIGHT);
});

test('every pairing meets its ratio in the dark theme', () => {
  check('dark', { ...LIGHT, ...DARK });
});

/* The dark set is written out twice, once in the media query and once on the attribute. They
   have to stay identical, or a system-dark session and an explicitly-dark one would not match. */
test('the two copies of the dark set are identical', () => {
  assert.deepEqual(
    DARK_MEDIA,
    DARK,
    'the prefers-color-scheme block and the data-theme block have drifted apart'
  );
});

/* Forces a decision: a new colour token fails this until it appears in PAIRINGS. */
test('every colour token is covered by the list', () => {
  const listed = new Set(PAIRINGS.flatMap((pairing) => [pairing.fg, pairing.bg]));

  for (const theme of [
    ['light', LIGHT],
    ['dark', { ...LIGHT, ...DARK }]
  ]) {
    for (const name of hexTokens(theme[1])) {
      assert.ok(
        listed.has(name),
        theme[0] +
          ': ' +
          name +
          ' is a colour token with no entry in PAIRINGS. Add one saying what it sits on and what ratio it owes.'
      );
    }
  }
});

test('the dark theme really is darker than the light one', () => {
  const light = contrastRatio(LIGHT['--color-bg'], '#000000');
  const dark = contrastRatio({ ...LIGHT, ...DARK }['--color-bg'], '#000000');

  assert.ok(light > dark, 'the dark background is not darker than the light one');
});

// --------------------------------------------------------------- the helper itself

test('contrastRatio matches the known extremes', () => {
  assert.equal(contrastRatio('#ffffff', '#000000').toFixed(2), '21.00');
  assert.equal(contrastRatio('#ffffff', '#ffffff').toFixed(2), '1.00');
  assert.equal(contrastRatio('#000000', '#000000').toFixed(2), '1.00');
});

test('contrastRatio is symmetric', () => {
  assert.equal(contrastRatio('#c2410c', '#ffffff'), contrastRatio('#ffffff', '#c2410c'));
});

/* The published boundary: #767676 is the lightest grey that still reaches 4.5:1 on white, and
   one step lighter does not. Getting both sides right is what makes this a real check. */
test('contrastRatio agrees with the published boundary grey', () => {
  assert.ok(contrastRatio('#767676', '#ffffff') >= 4.5, 'the boundary grey should pass');
  assert.ok(contrastRatio('#777777', '#ffffff') < 4.5, 'one step lighter should not');
  assert.ok(contrastRatio('#8a8a8a', '#ffffff') < 4.5);
});

test('shorthand hex is understood', () => {
  assert.deepEqual(parseHex('#fff'), { r: 255, g: 255, b: 255 });
  assert.equal(contrastRatio('#fff', '#000').toFixed(2), '21.00');
});

test('anything that is not a hex colour reads as null', () => {
  for (const value of ['rgb(0 0 0 / 0.5)', 'red', '', '#12345', null, 42, undefined]) {
    assert.equal(parseHex(value), null, JSON.stringify(value));
    assert.equal(contrastRatio(value, '#ffffff'), null);
  }
});

test('the token reader skips a block it cannot find', () => {
  assert.equal(readTokenBlock(css, ':root[data-theme="nope"]'), null);
});
