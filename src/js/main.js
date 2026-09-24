import { MAP_CONTAINER_ID } from './config.js';
import { createMap } from './map/create-map.js';
import { createMemoryStore } from './data/memory-store.js';
import { createIdFactory } from './data/make-id.js';

const DEV_HOSTNAMES = ['localhost', '127.0.0.1', '[::1]', '::1'];

function isDevHost() {
  return DEV_HOSTNAMES.includes(window.location.hostname);
}

function boot() {
  createMap(MAP_CONTAINER_ID);

  const store = createMemoryStore({
    storage: window.localStorage,
    now: () => new Date(),
    makeId: createIdFactory(window.crypto)
  });

  if (isDevHost()) {
    window.waypoints = store;
  }
}

document.addEventListener('DOMContentLoaded', boot);
