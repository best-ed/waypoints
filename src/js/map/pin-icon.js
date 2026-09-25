const PIN_WIDTH = 26;
const PIN_HEIGHT = 34;

/* A static literal with no memory fields in it, which is the only reason a markup string
   is acceptable here - L.divIcon takes HTML and nothing else. Anything carrying user text
   is built with createElement instead. */
const PIN_SVG = [
  '<svg class="pin-svg" viewBox="0 0 26 34" width="26" height="34" aria-hidden="true" focusable="false">',
  '<path class="pin-body" d="M13 1C6.9 1 2 5.9 2 12c0 8.2 11 21 11 21s11-12.8 11-21c0-6.1-4.9-11-11-11z"/>',
  '<circle class="pin-centre" cx="13" cy="12" r="4.2"/>',
  '</svg>'
].join('');

export function createPinIcon() {
  return L.divIcon({
    html: PIN_SVG,
    className: 'pin',
    iconSize: [PIN_WIDTH, PIN_HEIGHT],
    iconAnchor: [PIN_WIDTH / 2, PIN_HEIGHT],
    popupAnchor: [0, -PIN_HEIGHT + 4],
    tooltipAnchor: [0, -PIN_HEIGHT + 10]
  });
}
