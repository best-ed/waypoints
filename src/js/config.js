export const MAP_CONTAINER_ID = 'map';

export const DEFAULT_VIEW = {
  center: [-1.2921, 36.8219],
  zoom: 12
};

export const MIN_ZOOM = 3;
export const MAX_ZOOM = 19;

export const TILE_LAYER = {
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  // OpenStreetMap's tile usage policy requires this attribution to stay visible.
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: MAX_ZOOM
};
