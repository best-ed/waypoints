import { SELECT_ZOOM } from '../config.js';

export function focusMarker(map, marker) {
  const targetZoom = Math.max(map.getZoom(), SELECT_ZOOM);

  map.flyTo(marker.getLatLng(), targetZoom);
  marker.openPopup();
}
