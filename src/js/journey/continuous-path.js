import { haversineKm, interpolateGreatCircle, interpolatedPointCount } from './geometry.js';

/* The journey as one drawn run rather than a polyline per leg.

   Fifty-nine legs were fifty-nine SVG paths, each with its own stroke, its own join and its
   own place in the paint order, for a line that is conceptually one line. Two polylines - what
   is behind the playhead and what is ahead of it - say the same thing with two elements, and
   let the browser simplify the whole run at once instead of each leg in isolation.

   The catch is the antimeridian. geometry.js unwraps a leg so Nairobi to Honolulu continues
   past 180 rather than doubling back across Asia, which means a leg can END at a longitude the
   next leg does not START at: the next one is anchored to the real world again. That is the one
   place continuity genuinely breaks, and it is always at a stop. The run is cut there and the
   drawing continues as a second line, because the alternative is either a line drawn the wrong
   way round the planet or a path that drifts a whole turn off the map and is never seen. */

function hasCoordinates(memory) {
  return Number.isFinite(memory?.lat) && Number.isFinite(memory?.lng);
}

function samePlace(a, b) {
  return a.lat === b.lat && a.lng === b.lng;
}

const DEGREES_PER_HALF_TURN = 180;
const DEGREES_PER_TURN = 360;

/* Unwrapped against the point before it, exactly as geometry.js does within a leg. */
function continueFrom(previousLng, lng) {
  let next = lng;

  while (next - previousLng > DEGREES_PER_HALF_TURN) {
    next -= DEGREES_PER_TURN;
  }
  while (next - previousLng < -DEGREES_PER_HALF_TURN) {
    next += DEGREES_PER_TURN;
  }

  return next;
}

/* The drawn points for the whole journey, with the index of each stop's point alongside.

   A point carrying `cut` is the first of a new line. A stop that follows a leg which crossed
   the antimeridian appears twice: once ending the leg at its unwrapped longitude, and once
   starting the next line at the longitude the world actually has. `stopIndices` names the
   first of the two, so everything behind the playhead ends where the leg ended. */
export function continuousPath(stops) {
  const ordered = (Array.isArray(stops) ? stops : []).filter(hasCoordinates);

  if (ordered.length === 0) {
    return { points: [], stopIndices: [] };
  }

  const points = [{ lat: ordered[0].lat, lng: ordered[0].lng }];
  const stopIndices = [0];

  for (let index = 1; index < ordered.length; index++) {
    const from = ordered[index - 1];
    const to = ordered[index];

    /* Two memories pinned at the same spot have nothing to draw between them, and the second
       one still has to have a point on the path, so it shares the one already there. */
    if (samePlace(from, to)) {
      stopIndices.push(points.length - 1);
      continue;
    }

    const last = points[points.length - 1];
    const drift = last.lng - from.lng;

    /* The previous leg ended somewhere the world does not have this stop. Everything from
       here is drawn against real longitudes again, starting a new line. */
    if (drift !== 0) {
      points.push({ lat: from.lat, lng: from.lng, cut: true });
    }

    const between = interpolateGreatCircle(from, to, interpolatedPointCount(haversineKm(from, to)));

    let previousLng = from.lng;

    for (const point of [...between, { lat: to.lat, lng: to.lng }]) {
      const lng = continueFrom(previousLng, point.lng);
      points.push({ lat: point.lat, lng });
      previousLng = lng;
    }

    stopIndices.push(points.length - 1);
  }

  return { points, stopIndices };
}

/* One run of points split into the lines Leaflet should draw: a new line wherever a point
   says to cut, and nothing at all for a line of one point, which has no length to draw. */
function toLines(points) {
  const lines = [];
  let current = [];

  for (const point of points) {
    if (point.cut && current.length > 0) {
      lines.push(current);
      current = [];
    }
    current.push({ lat: point.lat, lng: point.lng });
  }

  if (current.length > 0) {
    lines.push(current);
  }

  return lines.filter((line) => line.length > 1);
}

/* What is behind the playhead and what is ahead of it, each as a list of lines. The stop
   itself belongs to both, so the two meet rather than leaving a gap at the pin.

   A current of null, or of anything that is not a stop, means there is no position in the
   journey yet: nothing is travelled and the whole path is still ahead. */
export function splitPathAtStop(points, stopIndices, current) {
  const path = Array.isArray(points) ? points : [];
  const indices = Array.isArray(stopIndices) ? stopIndices : [];

  if (path.length === 0 || indices.length === 0) {
    return { travelled: [], remaining: [] };
  }

  if (!Number.isInteger(current) || current <= 0) {
    return { travelled: [], remaining: toLines(path) };
  }

  if (current >= indices.length - 1) {
    return { travelled: toLines(path), remaining: [] };
  }

  const at = indices[current];

  return {
    travelled: toLines(path.slice(0, at + 1)),
    remaining: toLines(path.slice(at))
  };
}
