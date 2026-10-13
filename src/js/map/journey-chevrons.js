import { placeChevrons } from '../journey/place-chevrons.js';

const CHEVRON_SIZE = 16;

/* About a thumb's width apart. Closer and they read as a dotted line; further and a leg can
   cross the whole view without saying which way it goes. */
export const MIN_SPACING_PX = 80;

/* Below this the whole world is in the pane and a chevron every eighty pixels is confetti over
   a path nobody is following stop by stop at that scale. */
export const MIN_CHEVRON_ZOOM = 4;

/* How far outside the pane to keep placing them, so a pan of less than this does not arrive
   with an empty edge. */
const BOUNDS_PADDING_PX = 120;

/* A static literal with no user data in it, which is the only reason a markup string is
   acceptable - L.divIcon takes HTML and nothing else. The glyph points east at 0 degrees,
   so the rotation below is the screen angle directly. */
const CHEVRON_SVG = [
  '<span class="journey-chevron-glyph">',
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">',
  '<path class="journey-chevron-stroke" d="M5 3.5 L10.5 8 L5 12.5"/>',
  '</svg>',
  '</span>'
].join('');

function createChevronIcon() {
  return L.divIcon({
    html: CHEVRON_SVG,
    className: 'journey-chevron',
    iconSize: [CHEVRON_SIZE, CHEVRON_SIZE],
    iconAnchor: [CHEVRON_SIZE / 2, CHEVRON_SIZE / 2]
  });
}

/* Direction arrows along the part of the journey still ahead, spaced by how far apart they
   look rather than by one per leg.

   One per leg put thirty of them inside a city where somebody went back and forth, and none
   at all across the Pacific. Spacing in pixels gives the same density wherever the map is and
   at whatever zoom, which is the only thing a direction marker is for. The positions are
   worked out in screen space for the same reason the rotation always was: Mercator stretches
   north-south as latitude rises, so a true bearing sits visibly off the line. */
export function createJourneyChevrons(map) {
  const group = L.layerGroup();
  let markers = [];
  let lines = [];
  let attached = false;

  function removeAll() {
    group.clearLayers();
    markers = [];
  }

  /* The pane in layer-point space, padded, which is the rectangle worth drawing in. Layer
     points rather than container points because that is what the path projects to. */
  function visibleBounds() {
    const size = map.getSize();
    const topLeft = map.containerPointToLayerPoint([-BOUNDS_PADDING_PX, -BOUNDS_PADDING_PX]);
    const bottomRight = map.containerPointToLayerPoint([
      size.x + BOUNDS_PADDING_PX,
      size.y + BOUNDS_PADDING_PX
    ]);

    return {
      minX: topLeft.x,
      minY: topLeft.y,
      maxX: bottomRight.x,
      maxY: bottomRight.y
    };
  }

  function place() {
    removeAll();

    if (lines.length === 0 || map.getZoom() < MIN_CHEVRON_ZOOM) {
      return;
    }

    const bounds = visibleBounds();

    for (const line of lines) {
      const projected = line.map((point) => map.latLngToLayerPoint(point));

      for (const { x, y, angle } of placeChevrons(projected, MIN_SPACING_PX, { bounds })) {
        const marker = L.marker(map.layerPointToLatLng([x, y]), {
          icon: createChevronIcon(),
          /* Decoration only: it must not take clicks from the markers underneath, must not
             enter the tab order, and is hidden from assistive technology. The step order is
             already carried by the numbered pins and the progress readout. */
          interactive: false,
          keyboard: false
        });

        marker.addTo(group);

        const element = marker.getElement();

        if (element) {
          element.setAttribute('aria-hidden', 'true');
          /* The marker element carries Leaflet's positioning transform, which it rewrites on
             every pan, so the rotation goes on the span inside it. */
          const glyph = element.querySelector('.journey-chevron-glyph');
          if (glyph) {
            glyph.style.transform = 'rotate(' + angle.toFixed(2) + 'deg)';
          }
        }

        markers.push(marker);
      }
    }
  }

  /* The lines ahead of the playhead, which is all these ever mark: a direction is only a
     question about where the journey is going next. */
  function render(remainingLines) {
    lines = Array.isArray(remainingLines) ? remainingLines : [];

    if (!attached) {
      group.addTo(map);
      attached = true;
    }

    place();
  }

  function clear() {
    lines = [];
    removeAll();

    if (attached) {
      group.remove();
      attached = false;
    }
  }

  /* Both of these change which stretch is on screen and at what size, so both have to replace
     the whole set rather than nudge what is there. */
  map.on('zoomend', place);
  map.on('moveend', place);

  function dispose() {
    map.off('zoomend', place);
    map.off('moveend', place);
    clear();
  }

  return { render, clear, dispose, count: () => markers.length };
}
