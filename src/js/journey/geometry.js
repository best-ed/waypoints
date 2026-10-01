/* Mean Earth radius (IUGG). Any single radius is an approximation on an ellipsoid; this one
   keeps haversine within about 0.3% of the geodesic distance, which is well inside what a
   journey summary needs. */
const EARTH_RADIUS_KM = 6371.0088;

const DEGREES_PER_HALF_TURN = 180;
const DEGREES_PER_TURN = 360;

/* Below this a straight line on the map is indistinguishable from the great circle, so
   interpolating would add points for nothing. */
export const GREAT_CIRCLE_THRESHOLD_KM = 300;

/* One intermediate point per this many kilometres, so a short-haul arc is not over-sampled
   and a long-haul one still reads as a curve. */
export const KM_PER_INTERPOLATED_POINT = 200;

/* A cap, so a single antipodal pair cannot put thousands of points into a polyline. */
export const MAX_INTERPOLATED_POINTS = 64;

function toRadians(degrees) {
  return (degrees * Math.PI) / DEGREES_PER_HALF_TURN;
}

function toDegrees(radians) {
  return (radians * DEGREES_PER_HALF_TURN) / Math.PI;
}

function isPoint(point) {
  return Number.isFinite(point?.lat) && Number.isFinite(point?.lng);
}

export function haversineKm(a, b) {
  if (!isPoint(a) || !isPoint(b)) {
    return 0;
  }

  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const halfLat = toRadians(b.lat - a.lat) / 2;
  const halfLng = toRadians(b.lng - a.lng) / 2;

  const h =
    Math.sin(halfLat) * Math.sin(halfLat) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(halfLng) * Math.sin(halfLng);

  /* Clamped before asin: floating point can push h a hair above 1 for near-antipodal
     points, and asin would return NaN. */
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function angularDistance(a, b) {
  return haversineKm(a, b) / EARTH_RADIUS_KM;
}

/* Spherical interpolation. Interpolating lat and lng separately would give a straight line
   in the projection, which is not the path a plane or a road takes - over thousands of
   kilometres the two diverge visibly. Returns the intermediate points only; the caller
   still owns the endpoints. */
export function interpolateGreatCircle(a, b, count) {
  if (!isPoint(a) || !isPoint(b) || !Number.isFinite(count) || count < 1) {
    return [];
  }

  const d = angularDistance(a, b);
  const sinD = Math.sin(d);

  /* Coincident points have no direction to interpolate along, and antipodal ones have
     infinitely many: sinD vanishes in both cases and every term below blows up. */
  if (sinD === 0 || !Number.isFinite(sinD)) {
    return [];
  }

  const lat1 = toRadians(a.lat);
  const lng1 = toRadians(a.lng);
  const lat2 = toRadians(b.lat);
  const lng2 = toRadians(b.lng);

  const points = [];
  const steps = Math.min(Math.floor(count), MAX_INTERPOLATED_POINTS);

  for (let index = 1; index <= steps; index++) {
    const fraction = index / (steps + 1);

    const scaleA = Math.sin((1 - fraction) * d) / sinD;
    const scaleB = Math.sin(fraction * d) / sinD;

    const x = scaleA * Math.cos(lat1) * Math.cos(lng1) + scaleB * Math.cos(lat2) * Math.cos(lng2);
    const y = scaleA * Math.cos(lat1) * Math.sin(lng1) + scaleB * Math.cos(lat2) * Math.sin(lng2);
    const z = scaleA * Math.sin(lat1) + scaleB * Math.sin(lat2);

    points.push({
      lat: toDegrees(Math.atan2(z, Math.sqrt(x * x + y * y))),
      lng: toDegrees(Math.atan2(y, x))
    });
  }

  return points;
}

/* Leaflet draws exactly the longitudes it is given, including ones past +/-180, so a path
   crossing the antimeridian is expressed by continuing past it rather than by jumping back.
   Without this, Nairobi to Honolulu renders as a line straight back across Africa and the
   Atlantic - the long way round, and visually wrong. */
export function unwrapLongitudes(points) {
  const input = (Array.isArray(points) ? points : []).filter(isPoint);

  if (input.length === 0) {
    return [];
  }

  const unwrapped = [{ lat: input[0].lat, lng: input[0].lng }];
  let previousLng = input[0].lng;

  for (let index = 1; index < input.length; index++) {
    let lng = input[index].lng;

    while (lng - previousLng > DEGREES_PER_HALF_TURN) {
      lng -= DEGREES_PER_TURN;
    }
    while (lng - previousLng < -DEGREES_PER_HALF_TURN) {
      lng += DEGREES_PER_TURN;
    }

    unwrapped.push({ lat: input[index].lat, lng });
    previousLng = lng;
  }

  return unwrapped;
}

export function interpolatedPointCount(distanceKm) {
  if (!Number.isFinite(distanceKm) || distanceKm <= GREAT_CIRCLE_THRESHOLD_KM) {
    return 0;
  }

  return Math.min(
    Math.ceil(distanceKm / KM_PER_INTERPOLATED_POINT),
    MAX_INTERPOLATED_POINTS
  );
}

/* The drawable path for one segment: both endpoints, any great-circle points between them,
   and the whole run unwrapped so consecutive longitudes never leap the map. */
export function segmentPath(from, to) {
  if (!isPoint(from) || !isPoint(to)) {
    return [];
  }

  const distanceKm = haversineKm(from, to);
  const middle = interpolateGreatCircle(from, to, interpolatedPointCount(distanceKm));

  return unwrapLongitudes([
    { lat: from.lat, lng: from.lng },
    ...middle,
    { lat: to.lat, lng: to.lng }
  ]);
}
