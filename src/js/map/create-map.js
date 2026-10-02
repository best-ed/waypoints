import { DEFAULT_VIEW, MIN_ZOOM, MAX_ZOOM } from '../config.js';

export function createMap(containerId, { reducedMotion = false } = {}) {
  const map = L.map(containerId, {
    center: DEFAULT_VIEW.center,
    zoom: DEFAULT_VIEW.zoom,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    zoomControl: false,
    /* Set here because the cluster plugin's zoomToShowLayer calls fitBounds with no options
       of its own, and a map-level flag is the only way to stop that one animating. */
    zoomAnimation: !reducedMotion,
    fadeAnimation: !reducedMotion,
    markerZoomAnimation: !reducedMotion
  });

  /* No tile layer here: the basemap control owns it, so there is exactly one place that adds
     and removes one and the attribution cannot end up stacked. */

  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.control.scale({ metric: true, imperial: false }).addTo(map);

  return map;
}
