import { SELECT_ZOOM } from '../config.js';

/* The same test the cluster plugin makes internally: a marker is reachable only if it has an
   element and that element is in view. Without both, it is folded into a cluster or pruned by
   removeOutsideVisibleBounds, it has no DOM node, and openPopup would silently do nothing. */
function isReachable(map, marker) {
  return Boolean(marker.getElement()) && map.getBounds().contains(marker.getLatLng());
}

/* zoomToShowLayer zooms to the cluster's bounds, or spiderfies it where the markers sit on
   top of one another, and calls back only once the marker is genuinely on the map. It takes no
   animation options of its own - see the note in CLAUDE.md. Returns whether it took over. */
function reveal(map, marker, clusterGroup) {
  if (!clusterGroup || isReachable(map, marker)) {
    return false;
  }

  /* zoomToShowLayer reads the marker's parent cluster, which a marker still queued inside a
     chunked addLayers pass does not have yet. getVisibleParent walks the same chain and
     returns null instead of throwing, so it is the safe way to ask. */
  if (!clusterGroup.getVisibleParent(marker)) {
    return false;
  }

  clusterGroup.zoomToShowLayer(marker, () => marker.openPopup());
  return true;
}

/* Opens a popup without moving the view, for the paths that have not asked to travel: a move
   that has just finished, or a deletion being undone. */
export function openMarkerPopup(map, marker, { clusterGroup = null } = {}) {
  if (reveal(map, marker, clusterGroup)) {
    return;
  }

  marker.openPopup();
}

/* reducedMotion is passed in rather than read here so this module stays a Leaflet-only
   concern and the media query lives with the rest of the browser-facing code. */
export function focusMarker(map, marker, { reducedMotion = false, clusterGroup = null } = {}) {
  if (reveal(map, marker, clusterGroup)) {
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
