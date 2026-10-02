const PIN_WIDTH = 26;
const PIN_HEIGHT = 34;

const SVG_NS = 'http://www.w3.org/2000/svg';

const PIN_BODY_PATH = 'M13 1C6.9 1 2 5.9 2 12c0 8.2 11 21 11 21s11-12.8 11-21c0-6.1-4.9-11-11-11z';

/* Two digits already fill the pin head; three would spill out of it. */
const WIDE_STEP = 10;

function svgElement(name, attributes) {
  const element = document.createElementNS(SVG_NS, name);

  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, value);
  }

  return element;
}

/* Built as DOM rather than a markup string. L.divIcon accepts an Element, which means the
   step number goes in through textContent like every other piece of text in the app, and
   src/ is left with no markup strings at all. */
function buildPin() {
  const svg = svgElement('svg', {
    class: 'pin-svg',
    viewBox: '0 0 ' + PIN_WIDTH + ' ' + PIN_HEIGHT,
    width: String(PIN_WIDTH),
    height: String(PIN_HEIGHT),
    'aria-hidden': 'true',
    focusable: 'false'
  });

  svg.append(svgElement('path', { class: 'pin-body', d: PIN_BODY_PATH }));

  return svg;
}

/* The name lives inside the icon rather than being set on the marker element afterwards.
   A clustered marker has no element at all until the cluster opens, so anything applied by
   hand at creation time would be lost - and nothing would put it back when the marker finally
   rendered. Carried in the icon, the name is correct whenever the marker exists.

   Leaflet gives a keyboard marker role="button" and tabindex="0", and a button with no
   attribute name takes it from its contents, which is this hidden span. The SVG is
   aria-hidden so it contributes nothing. */
function iconContent(svg, name) {
  const wrapper = document.createElement('span');
  wrapper.className = 'pin-content';
  wrapper.append(svg);

  if (typeof name === 'string' && name !== '') {
    const label = document.createElement('span');
    label.className = 'visually-hidden';
    label.textContent = name;
    wrapper.append(label);
  }

  return wrapper;
}

const SHARED_OPTIONS = {
  iconSize: [PIN_WIDTH, PIN_HEIGHT],
  iconAnchor: [PIN_WIDTH / 2, PIN_HEIGHT],
  popupAnchor: [0, -PIN_HEIGHT + 4],
  tooltipAnchor: [0, -PIN_HEIGHT + 10]
};

/* A fresh element every call: one Element cannot be shared between markers, since divIcon
   appends the very node it is given. */
export function createPinIcon(name) {
  const svg = buildPin();
  svg.append(svgElement('circle', { class: 'pin-centre', cx: '13', cy: '12', r: '4.2' }));

  return L.divIcon({ html: iconContent(svg, name), className: 'pin', ...SHARED_OPTIONS });
}

/* The number replaces the dot rather than sitting over it, so it scales with the pin and
   needs no separate positioning. It is inside the aria-hidden SVG, so the step reaches a
   screen reader through the name instead. */
export function createNumberedPinIcon(step, name) {
  const svg = buildPin();

  const text = svgElement('text', {
    class: 'pin-number' + (step >= WIDE_STEP ? ' is-wide' : ''),
    x: '13',
    y: '12.5',
    'text-anchor': 'middle',
    'dominant-baseline': 'middle'
  });
  text.textContent = String(step);

  svg.append(text);

  return L.divIcon({
    html: iconContent(svg, name),
    className: 'pin pin-journey',
    ...SHARED_OPTIONS
  });
}
