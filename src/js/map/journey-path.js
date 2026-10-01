import { segmentPath } from '../journey/geometry.js';
import { journeySegments } from '../journey/journey-order.js';

/* Width and colour come from CSS so the tokens stay in one place. Leaflet writes stroke and
   stroke-width as presentation attributes, which CSS overrides, so these are only a
   fallback if the stylesheet is missing. */
const SEGMENT_STYLE = {
  className: 'journey-segment',
  weight: 3,
  opacity: 1,
  /* The path must not swallow clicks meant for the markers underneath it, and it should not
     turn up in the tab order either. */
  interactive: false
};

const FIT_PADDING = [48, 48];

export function createJourneyPath(map) {
  const group = L.layerGroup();
  let entries = [];
  let attached = false;

  function clear() {
    group.clearLayers();
    entries = [];

    if (attached) {
      group.remove();
      attached = false;
    }
  }

  /* One polyline per segment rather than a single many-point line, so playback can restyle
     the stretch already travelled without redrawing the rest. */
  function render(stops) {
    clear();

    entries = journeySegments(stops).map((segment) => {
      const polyline = L.polyline(segmentPath(segment.from, segment.to), SEGMENT_STYLE);
      polyline.addTo(group);
      return { polyline, fromIndex: segment.fromIndex, toIndex: segment.toIndex };
    });

    group.addTo(map);
    attached = true;
  }

  /* Idle playback passes null, which leaves every segment at full strength: muting only
     means something once there is a position in the journey to be ahead of. */
  function setProgress(activeIndex) {
    const hasPosition = Number.isInteger(activeIndex);

    for (const entry of entries) {
      const element = entry.polyline.getElement();
      if (!element) {
        continue;
      }

      element.classList.toggle('is-traversed', hasPosition && entry.toIndex <= activeIndex);
      element.classList.toggle('is-pending', hasPosition && entry.toIndex > activeIndex);
    }
  }

  /* Built from the drawn points, not from the stops, so an unwrapped longitude past 180 is
     inside the view rather than off the edge of it. */
  function getBounds(stops) {
    const points = [];

    for (const stop of Array.isArray(stops) ? stops : []) {
      points.push([stop.lat, stop.lng]);
    }

    for (const entry of entries) {
      for (const point of entry.polyline.getLatLngs()) {
        points.push(point);
      }
    }

    return points.length > 0 ? L.latLngBounds(points) : null;
  }

  function fit(stops, { reducedMotion = false } = {}) {
    const bounds = getBounds(stops);

    if (!bounds || !bounds.isValid()) {
      return;
    }

    map.fitBounds(bounds, { padding: FIT_PADDING, animate: !reducedMotion });
  }

  function segmentCount() {
    return entries.length;
  }

  return { render, setProgress, fit, getBounds, clear, segmentCount };
}
