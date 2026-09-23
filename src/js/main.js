import { MAP_CONTAINER_ID } from './config.js';
import { createMap } from './map/create-map.js';

function boot() {
  createMap(MAP_CONTAINER_ID);
}

document.addEventListener('DOMContentLoaded', boot);
