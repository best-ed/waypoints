import { SELECT_ZOOM } from '../config.js';

/* The same test the cluster plugin makes internally: a marker is reachable only if it has an
   element and that element is in view. Without both, it is folded into a cluster or pruned by
   removeOutsideVisibleBounds, it has no DOM node, and openPopup would silently do nothing. */
function isReachable(map, marker) {
  return Boolean(marker.getElement()) && map.getBounds().contains(marker.getLatLng());
}

/* reducedMotion is passed in rather than read here so this module stays a Leaflet-only
   concern and the media query lives with the rest of the browser-facing code. */
export function focusMarker(map, marker, { reducedMotion = false, clusterGroup = null } = {}) {
  /* zoomToShowLayer zooms to the cluster's bounds, or spiderfies it where the markers sit on
     top of one another, and calls back only once the marker is genuinely on the map. It takes
     no animation options of its own - see the note in CLAUDE.md. */
  if (clusterGroup && !isReachable(map, marker)) {
    clusterGroup.zoomToShowLayer(marker, () => marker.openPopup());
    return;
  }

  const targetZoom = Math.max(map.getZoom(), SELECT_ZOOM);
  const position = marker.getLatLng();

  if (reducedMotion) {
    map.setView(position, targetZoom, { animate: false });
  } else {
    map.flyTo(position, targetZoom);
  }

  marker.openPopup();
}
