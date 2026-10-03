import { CLUSTER_DISABLE_ZOOM, SELECT_ZOOM } from '../config.js';

/* The same test the cluster plugin makes internally: a marker is reachable only if it has an
   element and that element is in view. Without both, it is folded into a cluster or pruned by
   removeOutsideVisibleBounds, it has no DOM node, and openPopup would silently do nothing. */
function isReachable(map, marker) {
  return Boolean(marker.getElement()) && map.getBounds().contains(marker.getLatLng());
}

/* zoomToShowLayer zooms to the cluster's bounds, or spiderfies it where the markers sit on
   top of one another, and calls back only once the marker is genuinely on the map. Returns
   whether it took over.

   Under reduced motion it is bypassed entirely. Internally it calls panTo, and pan animation
   in Leaflet is a per-call option that the plugin never passes, so that one pan animates no
   matter what the map or the plugin is configured with. Jumping straight to the zoom at which
   clustering is switched off reaches the same place: the marker is guaranteed to be its own pin
   there, so there is nothing left to reveal. */
function reveal(map, marker, clusterGroup, reducedMotion) {
  if (!clusterGroup || isReachable(map, marker)) {
    return false;
  }

  if (reducedMotion) {
    map.setView(marker.getLatLng(), CLUSTER_DISABLE_ZOOM, { animate: false });
    marker.openPopup();
    return true;
  }

  clusterGroup.zoomToShowLayer(marker, () => marker.openPopup());
  return true;
}

/* Opens a popup without moving the view, for the paths that have not asked to travel: a move
   that has just finished, or a deletion being undone. */
export function openMarkerPopup(map, marker, { clusterGroup = null, reducedMotion = false } = {}) {
  if (reveal(map, marker, clusterGroup, reducedMotion)) {
    return;
  }

  marker.openPopup();
}

/* reducedMotion is passed in rather than read here so this module stays a Leaflet-only
   concern and the media query lives with the rest of the browser-facing code. */
export function focusMarker(map, marker, { reducedMotion = false, clusterGroup = null } = {}) {
  if (reveal(map, marker, clusterGroup, reducedMotion)) {
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
