import { segmentPath } from '../journey/geometry.js';
import { journeySegments } from '../journey/journey-order.js';

const CHEVRON_SIZE = 16;

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

/* The two drawn points either side of the halfway mark. On an interpolated arc this is a
   short hop along the curve, so the chevron sits on the line rather than off the chord. */
function bracketAt(path) {
  const middle = Math.max(1, Math.floor(path.length / 2));
  return [path[middle - 1], path[middle]];
}

function midpointOf(a, b) {
  return { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
}

export function createJourneyChevrons(map) {
  const group = L.layerGroup();
  let entries = [];
  let attached = false;

  /* Projected screen points, not a geographic bearing: the chevron has to line up with the
     pixels Leaflet actually drew, and Mercator stretches north-south as latitude rises, so a
     true bearing would sit visibly off the line at high latitudes. */
  function screenAngle(near, far, fallbackNear, fallbackFar) {
    const from = map.latLngToLayerPoint(near);
    const to = map.latLngToLayerPoint(far);

    let dx = to.x - from.x;
    let dy = to.y - from.y;

    /* latLngToLayerPoint rounds to whole pixels, so zoomed out far enough a short bracket
       collapses onto one pixel and the angle becomes meaningless. Widening to the segment's
       own endpoints gives a vector that still spans pixels at any zoom. */
    if (dx === 0 && dy === 0) {
      const wideFrom = map.latLngToLayerPoint(fallbackNear);
      const wideTo = map.latLngToLayerPoint(fallbackFar);
      dx = wideTo.x - wideFrom.x;
      dy = wideTo.y - wideFrom.y;
    }

    if (dx === 0 && dy === 0) {
      return null;
    }

    return (Math.atan2(dy, dx) * 180) / Math.PI;
  }

  /* Rotation goes on an inner span, never on the marker element: Leaflet owns that one's
     transform for positioning and overwrites it on every pan. */
  function applyAngle(entry) {
    const element = entry.marker.getElement();
    const glyph = element ? element.querySelector('.journey-chevron-glyph') : null;

    if (element) {
      element.setAttribute('aria-hidden', 'true');
    }

    if (!glyph) {
      return;
    }

    const angle = screenAngle(entry.near, entry.far, entry.start, entry.end);

    if (angle === null) {
      glyph.hidden = true;
      return;
    }

    glyph.hidden = false;
    glyph.style.transform = 'rotate(' + angle.toFixed(2) + 'deg)';
  }

  function refreshAngles() {
    for (const entry of entries) {
      applyAngle(entry);
    }
  }

  function clear() {
    group.clearLayers();
    entries = [];

    if (attached) {
      group.remove();
      attached = false;
    }
  }

  function render(stops) {
    clear();

    entries = journeySegments(stops).map((segment) => {
      const path = segmentPath(segment.from, segment.to);
      const [near, far] = bracketAt(path);

      const marker = L.marker(midpointOf(near, far), {
        icon: createChevronIcon(),
        /* Decoration only: it must not take clicks from the markers underneath, must not
           enter the tab order, and is hidden from assistive technology. The step order is
           already carried by the numbered pins and the progress readout. */
        interactive: false,
        keyboard: false
      });

      marker.addTo(group);

      return {
        marker,
        near,
        far,
        start: path[0],
        end: path[path.length - 1],
        toIndex: segment.toIndex
      };
    });

    group.addTo(map);
    attached = true;
    refreshAngles();
  }

  function setProgress(activeIndex) {
    const hasPosition = Number.isInteger(activeIndex);

    for (const entry of entries) {
      const element = entry.marker.getElement();
      if (element) {
        element.classList.toggle('is-pending', hasPosition && entry.toIndex > activeIndex);
      }
    }
  }

  map.on('zoomend', refreshAngles);

  function dispose() {
    map.off('zoomend', refreshAngles);
    clear();
  }

  return { render, setProgress, refreshAngles, clear, dispose, count: () => entries.length };
}
