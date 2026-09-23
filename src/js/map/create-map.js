import { DEFAULT_VIEW, MIN_ZOOM, MAX_ZOOM, TILE_LAYER } from '../config.js';

export function createMap(containerId) {
  const map = L.map(containerId, {
    center: DEFAULT_VIEW.center,
    zoom: DEFAULT_VIEW.zoom,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    zoomControl: false
  });

  L.tileLayer(TILE_LAYER.url, {
    attribution: TILE_LAYER.attribution,
    maxZoom: TILE_LAYER.maxZoom
  }).addTo(map);

  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.control.scale({ metric: true, imperial: false }).addTo(map);

  return map;
}
