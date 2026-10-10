import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createIcon, ICON_NAMES, ICON_SIZE, ICONS, STROKE_WIDTH } from '../../src/js/ui/icons.js';

/* Enough of a document for a module that only ever creates namespaced elements and sets
   attributes on them. A real DOM would prove nothing extra here and would cost a dependency
   the app does not have. */
function fakeDocument() {
  const made = [];

  globalThis.document = {
    createElementNS(ns, tag) {
      const node = {
        ns,
        tag,
        attributes: {},
        children: [],
        setAttribute(name, value) {
          assert.equal(typeof value, 'string', tag + '.' + name + ' was set to a non-string');
          this.attributes[name] = value;
        },
        append(...nodes) {
          this.children.push(...nodes);
        },
        querySelector() {
          return null;
        }
      };

      made.push(node);
      return node;
    }
  };

  return made;
}

/* Every icon the interface asks for. A control that wants one of these and finds it missing
   would throw at the moment it renders, which is a worse place to find out. */
const REQUIRED = [
  'add', 'settings', 'search', 'close', 'map', 'list', 'filter', 'calendar', 'tag', 'photo',
  'pin', 'route', 'play', 'pause', 'previous', 'next', 'undo', 'export', 'import', 'offline',
  'chevron', 'back'
];

test('every icon the app uses is in the set', () => {
  for (const name of REQUIRED) {
    assert.ok(ICONS[name], 'missing icon: ' + name);
  }
});

test('the set carries nothing the app does not use', () => {
  const extra = ICON_NAMES.filter((name) => !REQUIRED.includes(name));

  assert.deepEqual(extra, [], 'unused icons: ' + extra.join(', '));
});

test('every primitive is well formed', () => {
  for (const [name, primitives] of Object.entries(ICONS)) {
    assert.ok(Array.isArray(primitives) && primitives.length > 0, name + ' has no shapes');

    for (const primitive of primitives) {
      if (primitive[0] === 'circle') {
        assert.equal(primitive.length, 4, name + ': a circle takes cx, cy and r');
        for (const value of primitive.slice(1)) {
          assert.equal(typeof value, 'number', name + ': a circle coordinate is not a number');
        }
      } else {
        assert.equal(primitive[0], 'path', name + ': unknown primitive ' + primitive[0]);
        assert.match(primitive[1], /^M/, name + ': a path should start with a move');
      }
    }
  }
});

test('every coordinate is inside the grid', () => {
  /* A shape that runs past the viewBox is clipped, and the clipping only shows up at one
     size, which is the kind of thing nobody notices until it ships. */
  for (const [name, primitives] of Object.entries(ICONS)) {
    for (const primitive of primitives) {
      if (primitive[0] === 'circle') {
        const [, cx, cy, r] = primitive;
        assert.ok(cx - r >= 0 && cx + r <= ICON_SIZE, name + ': a circle runs outside horizontally');
        assert.ok(cy - r >= 0 && cy + r <= ICON_SIZE, name + ': a circle runs outside vertically');
        continue;
      }

      /* Absolute coordinates only; the relative runs inside a path are measured from wherever
         the pen is, so only the absolute ones can be checked this cheaply. */
      for (const [, x, y] of primitive[1].matchAll(/[ML]\s*(-?[\d.]+)\s+(-?[\d.]+)/g)) {
        assert.ok(Number(x) >= 0 && Number(x) <= ICON_SIZE, name + ': x ' + x + ' is outside the grid');
        assert.ok(Number(y) >= 0 && Number(y) <= ICON_SIZE, name + ': y ' + y + ' is outside the grid');
      }
    }
  }
});

test('no icon carries a colour of its own', () => {
  /* The same rule the rest of the app follows: an icon takes its colour from the text around
     it, so there is no hex anywhere to go stale when a theme changes. */
  const serialised = JSON.stringify(ICONS);

  assert.doesNotMatch(serialised, /#[0-9a-f]{3,8}/i);
  assert.doesNotMatch(serialised, /rgb|fill|stroke/i);
});

test('an icon is built as decoration, with the drawing attributes it needs', () => {
  fakeDocument();
  const svg = createIcon('search');

  assert.equal(svg.tag, 'svg');
  assert.equal(svg.ns, 'http://www.w3.org/2000/svg');
  assert.equal(svg.attributes['aria-hidden'], 'true');
  assert.equal(svg.attributes.focusable, 'false');
  assert.equal(svg.attributes.viewBox, '0 0 24 24');
  assert.equal(svg.attributes.fill, 'none');
  assert.equal(svg.attributes.stroke, 'currentColor');
  assert.equal(svg.attributes['stroke-width'], String(STROKE_WIDTH));
  assert.equal(svg.attributes['stroke-linecap'], 'round');
  assert.equal(svg.attributes['stroke-linejoin'], 'round');
  assert.equal(svg.children.length, ICONS.search.length);
});

test('an icon can be drawn at a size other than the grid', () => {
  fakeDocument();
  const svg = createIcon('add', { size: 16 });

  assert.equal(svg.attributes.width, '16');
  assert.equal(svg.attributes.height, '16');
  /* The viewBox never changes, which is what keeps the stroke weight proportional. */
  assert.equal(svg.attributes.viewBox, '0 0 24 24');
});

test('asking for an icon that does not exist throws rather than rendering nothing', () => {
  fakeDocument();

  assert.throws(() => createIcon('teapot'), /unknown icon: teapot/);
});

test('every icon in the set can actually be built', () => {
  fakeDocument();

  for (const name of ICON_NAMES) {
    const svg = createIcon(name);
    assert.equal(svg.children.length, ICONS[name].length, name + ' lost a shape');
  }
});
