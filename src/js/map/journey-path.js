import { continuousPath, splitPathAtStop } from '../journey/continuous-path.js';
import { weightForZoom } from '../journey/line-weight.js';

/* Two polylines, not fifty-nine: what is behind the playhead and what is ahead of it. Both
   carry several rings, so a path cut at an antimeridian crossing is still one element.

   Colour, caps and the dash come from CSS, as everything else does. The weight does not: it
   answers how far out the map is, which no stylesheet can see, so it comes from the pure
   helper through Leaflet's own style and the stylesheet states no stroke-width at all. */

/* Screen-space simplification, applied by Leaflet before it writes the path data. At 1 - the
   default - a worldwide journey hands the browser thousands of points that land inside the
   same pixel; at 3 the drawn shape is unchanged where it matters and the band of overlapping
   strokes at low zoom thins out. Chosen against the low-zoom screenshots. */
const SMOOTH_FACTOR = 3;

const SHARED_STYLE = {
  opacity: 1,
  /* The path must not swallow clicks meant for the markers underneath it, and it should not
     turn up in the tab order either. */
  interactive: false,
  smoothFactor: SMOOTH_FACTOR
};

const TRAVELLED_STYLE = { ...SHARED_STYLE, className: 'journey-segment is-traversed' };
const REMAINING_STYLE = { ...SHARED_STYLE, className: 'journey-segment' };

const FIT_PADDING = [48, 48];

export function createJourneyPath(map) {
  const group = L.layerGroup();

  const travelled = L.polyline([], TRAVELLED_STYLE);
  const remaining = L.polyline([], REMAINING_STYLE);

  let points = [];
  let stopIndices = [];
  let position = null;
  let attached = false;

  /* A polyline with nothing in it still draws a path element, so the ones with no lines are
     taken off the group entirely. That is also what keeps the element count honest. */
  function show(line, lines) {
    line.setLatLngs(lines);

    if (lines.length === 0) {
      group.removeLayer(line);
      return;
    }

    if (!group.hasLayer(line)) {
      group.addLayer(line);
    }
  }

  function applyWeight() {
    const weight = weightForZoom(map.getZoom());
    travelled.setStyle({ weight });
    remaining.setStyle({ weight });
  }

  function draw() {
    const split = splitPathAtStop(points, stopIndices, position);

    show(travelled, split.travelled);
    show(remaining, split.remaining);

    /* Set on the element rather than through the className option, which Leaflet reads once
       when it builds the path and never looks at again. Before the journey has a position
       nothing is behind anything, so the whole run stays at full strength rather than reading
       as a route nobody has started. */
    remaining.getElement()?.classList.toggle('is-pending', position !== null);

    applyWeight();
  }

  function clear() {
    position = null;
    points = [];
    stopIndices = [];

    travelled.setLatLngs([]);
    remaining.setLatLngs([]);
    group.clearLayers();

    if (attached) {
      group.remove();
      attached = false;
    }
  }

  function render(stops) {
    const built = continuousPath(stops);

    points = built.points;
    stopIndices = built.stopIndices;

    draw();

    if (!attached) {
      group.addTo(map);
      attached = true;
    }
  }

  /* Idle playback passes null, which leaves the whole path at full strength: being behind the
     playhead only means something once there is a playhead. */
  function setProgress(activeIndex) {
    position = Number.isInteger(activeIndex) ? activeIndex : null;
    draw();
  }

  /* Built from the drawn points, not from the stops, so an unwrapped longitude past 180 is
     inside the view rather than off the edge of it. */
  function getBounds(stops) {
    const all = [];

    for (const stop of Array.isArray(stops) ? stops : []) {
      all.push([stop.lat, stop.lng]);
    }

    for (const point of points) {
      all.push([point.lat, point.lng]);
    }

    return all.length > 0 ? L.latLngBounds(all) : null;
  }

  function fit(stops, { reducedMotion = false } = {}) {
    const bounds = getBounds(stops);

    if (!bounds || !bounds.isValid()) {
      return;
    }

    map.fitBounds(bounds, { padding: FIT_PADDING, animate: !reducedMotion });
  }

  map.on('zoomend', applyWeight);

  function dispose() {
    map.off('zoomend', applyWeight);
    clear();
  }

  return {
    render,
    setProgress,
    fit,
    getBounds,
    clear,
    dispose,
    /* What is ahead of the playhead, for the chevrons to be spaced along. */
    remainingLines: () => splitPathAtStop(points, stopIndices, position).remaining,
    lineCount: () => {
      const split = splitPathAtStop(points, stopIndices, position);
      return split.travelled.length + split.remaining.length;
    }
  };
}
