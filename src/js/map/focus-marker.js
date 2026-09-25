import { SELECT_ZOOM } from '../config.js';

/* reducedMotion is passed in rather than read here so this module stays a Leaflet-only
   concern and the media query lives with the rest of the browser-facing code. */
export function focusMarker(map, marker, { reducedMotion = false } = {}) {
  const targetZoom = Math.max(map.getZoom(), SELECT_ZOOM);
  const position = marker.getLatLng();

  if (reducedMotion) {
    map.setView(position, targetZoom, { animate: false });
  } else {
    map.flyTo(position, targetZoom);
  }

  marker.openPopup();
}
