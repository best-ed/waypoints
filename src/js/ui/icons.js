/* The icon set. Drawn for this app rather than taken from a library: every path here is
   written out below and can be read.

   One grid and one weight, which is what makes a set a set:

   - 24 by 24, so a 2px stroke is 1/12 of the box and reads at 16px as well as at 24px
   - strokes only, never fills, so an icon is one colour and that colour is currentColor
   - round caps and joins, to match the pin and the rounded controls around them
   - geometry on whole or half pixels wherever the shape allows, so nothing blurs at 1x

   An icon is decoration. It is marked aria-hidden and the accessible name stays on the
   control, which is what lets the same button show an icon and a label on a wide screen and
   the icon alone on a narrow one without its name changing. */

const SVG_NS = 'http://www.w3.org/2000/svg';

export const ICON_SIZE = 24;
export const STROKE_WIDTH = 2;

/* Inside a button an icon sits a little under the grid size, so it reads as a sibling of the
   label rather than as something the label is attached to. */
export const ICON_BUTTON_SIZE = 20;

/* Each icon is a list of primitives rather than one path string, because a circle written as
   two arcs is unreadable and nobody would ever correct it. */
export const ICONS = Object.freeze({
  add: [['path', 'M12 5.5v13'], ['path', 'M5.5 12h13']],

  /* Two faders, which says "adjust" rather than the cog's "machinery". Drawn vertically
     after comparing both at four sizes: laid out horizontally the knobs and the tracks run
     together below about 20px and the whole thing turns into a smudge. */
  settings: [
    ['path', 'M8 3.5v4'],
    ['path', 'M8 13.5v7'],
    ['path', 'M16 3.5v7'],
    ['path', 'M16 16.5v4'],
    ['circle', 8, 10.5, 3],
    ['circle', 16, 13.5, 3]
  ],

  search: [['circle', 10.5, 10.5, 6], ['path', 'M15 15l5.5 5.5']],

  close: [['path', 'M6 6l12 12'], ['path', 'M18 6L6 18']],

  /* A folded paper map: three panels, the creases alternating up and down. */
  map: [['path', 'M3 6.5l6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5V6.5z'], ['path', 'M9 4v13.5'], ['path', 'M15 6.5V20']],

  list: [
    ['path', 'M4 7h1.5'],
    ['path', 'M9 7h11'],
    ['path', 'M4 12h1.5'],
    ['path', 'M9 12h11'],
    ['path', 'M4 17h1.5'],
    ['path', 'M9 17h11']
  ],

  filter: [['path', 'M4 5h16l-6 7.5V20l-4-2.5v-5L4 5z']],

  calendar: [
    ['path', 'M4 6.5h16V20H4V6.5z'],
    ['path', 'M4 10.5h16'],
    ['path', 'M8.5 4v4'],
    ['path', 'M15.5 4v4']
  ],

  /* A luggage label, pierced at the narrow end. */
  tag: [['path', 'M3.5 10.5V3.5h7l10 10-7 7-10-10z'], ['circle', 7.5, 7.5, 1.5]],

  photo: [['path', 'M3.5 5.5h17v13h-17v-13z'], ['path', 'M3.5 15l4.5-4 3 2.5 4-3.5 5 4.5'], ['circle', 8.5, 9.5, 1.5]],

  pin: [['path', 'M12 20.5s6.5-6.5 6.5-10.5a6.5 6.5 0 1 0-13 0c0 4 6.5 10.5 6.5 10.5z'], ['circle', 12, 10, 2.5]],

  /* The journey: a path bending between a start and an end, the same curve the map draws. */
  route: [['path', 'M6 17.5c0-4 4.5-3.5 6-5.5s1.5-5.5 6-5.5'], ['circle', 5.5, 18, 2], ['circle', 18.5, 6, 2]],

  play: [['path', 'M8 5.5l11 6.5-11 6.5v-13z']],

  pause: [['path', 'M9 5.5v13'], ['path', 'M15 5.5v13']],

  previous: [['path', 'M18 5.5l-9 6.5 9 6.5v-13z'], ['path', 'M5.5 5.5v13']],

  next: [['path', 'M6 5.5l9 6.5-9 6.5v-13z'], ['path', 'M18.5 5.5v13']],

  /* An arrow turning back on itself, which is the gesture undo is named after. */
  undo: [['path', 'M4 10.5h9.5a5 5 0 0 1 0 10H8'], ['path', 'M8 6.5l-4 4 4 4']],

  /* Out of the tray and away, against into the tray and down. The tray is the same in both,
     so the direction of the arrow is the whole difference, which is the point. */
  export: [['path', 'M12 15V4'], ['path', 'M8 8l4-4 4 4'], ['path', 'M4 14.5V20h16v-5.5']],

  import: [['path', 'M12 4v11'], ['path', 'M8 11l4 4 4-4'], ['path', 'M4 14.5V20h16v-5.5']],

  /* A cloud struck through: the thing that is unreachable, and the fact that it is. One
     bump rather than two, because at 16px a second one closes up into the first. */
  offline: [
    ['path', 'M6.5 17.5h11a3.5 3.5 0 0 0 0-7 5.5 5.5 0 0 0-10.3-1.6 3.5 3.5 0 0 0-.7 8.6z'],
    ['path', 'M4.5 5l15 14']
  ],

  chevron: [['path', 'M9.5 5.5l6.5 6.5-6.5 6.5']],

  /* A full arrow rather than the chevron turned round. The chevron is the disclosure marker
     and it earns its meaning by always pointing at what opens; a shaft says "go back there",
     which is a different thing and deserves a different glyph. The head meets the shaft on
     the same pixel so nothing shows through the join at 14px. */
  back: [['path', 'M19.5 12H5'], ['path', 'M10.5 6.5L5 12l5.5 5.5']]
});

export const ICON_NAMES = Object.freeze(Object.keys(ICONS));

function shape(primitive) {
  if (primitive[0] === 'circle') {
    const [, cx, cy, r] = primitive;
    const node = document.createElementNS(SVG_NS, 'circle');
    node.setAttribute('cx', String(cx));
    node.setAttribute('cy', String(cy));
    node.setAttribute('r', String(r));
    return node;
  }

  const node = document.createElementNS(SVG_NS, 'path');
  node.setAttribute('d', primitive[1]);
  return node;
}

/* Built as DOM nodes rather than assembled from a markup string, for the same reason every
   other surface in the app is: there is then no template anywhere that a value could be
   interpolated into. Nothing here is user data, but the rule is worth keeping unbroken. */
export function createIcon(name, { size = ICON_SIZE, className = 'icon' } = {}) {
  const primitives = ICONS[name];

  if (!primitives) {
    throw new Error('unknown icon: ' + name);
  }

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + ICON_SIZE + ' ' + ICON_SIZE);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', String(STROKE_WIDTH));
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  /* Decoration. The name belongs to the control, not to the picture inside it. focusable is
     for the engines that still put an svg in the tab order on their own. */
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  if (className) {
    svg.setAttribute('class', className);
  }

  for (const primitive of primitives) {
    svg.append(shape(primitive));
  }

  return svg;
}

/* Replaces whatever icon a control is carrying. For a button whose meaning changes under it,
   like play becoming pause. */
export function setButtonIcon(button, name, { size = ICON_BUTTON_SIZE } = {}) {
  if (!button) {
    return button;
  }

  const existing = button.querySelector('svg');
  const icon = createIcon(name, { size });

  if (existing) {
    existing.replaceWith(icon);
  } else {
    button.prepend(icon);
  }

  return button;
}

/* The markup says which icon a control wants and this puts it there, so index.html stays
   declarative and there is one place that knows how an icon gets into a button.

   The icon goes first, before the label, which is the order every control in the app reads
   in. Running twice is harmless: a control that already has one is left alone. */
export function applyIcons(root = document) {
  const applied = [];

  for (const element of root.querySelectorAll('[data-icon]')) {
    if (element.querySelector('svg')) {
      continue;
    }

    const size = element.dataset.iconSize ? Number(element.dataset.iconSize) : ICON_BUTTON_SIZE;
    element.prepend(createIcon(element.dataset.icon, { size }));
    applied.push(element.dataset.icon);
  }

  return applied;
}
