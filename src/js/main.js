import { MAP_CONTAINER_ID } from './config.js';
import { createMap } from './map/create-map.js';
import { createMemoryStore } from './data/memory-store.js';
import { createIdFactory } from './data/make-id.js';
import { createPlacementMode } from './map/placement-mode.js';
import { createDraftMarker } from './map/draft-marker.js';
import { createMarkersLayer } from './map/markers-layer.js';
import { createMemoryForm } from './ui/memory-form.js';
import { ValidationError, StorageFullError } from './data/errors.js';

const DEV_HOSTNAMES = ['localhost', '127.0.0.1', '[::1]', '::1'];

const STORAGE_FULL_MESSAGE =
  'There is no room left in this browser to save another memory. Remove one and try again.';
const UNEXPECTED_MESSAGE = 'Something went wrong saving this memory. Please try again.';

function isDevHost() {
  return DEV_HOSTNAMES.includes(window.location.hostname);
}

function boot() {
  const map = createMap(MAP_CONTAINER_ID);

  const store = createMemoryStore({
    storage: window.localStorage,
    now: () => new Date(),
    makeId: createIdFactory(window.crypto)
  });

  const addButton = document.getElementById('add-memory');
  const markers = createMarkersLayer(map);
  const draftMarker = createDraftMarker(map);

  markers.sync(store.list());
  store.subscribe((memories) => markers.sync(memories));

  const form = createMemoryForm({
    onSubmit: (values) => handleSubmit(values),
    onCancel: () => draftMarker.clear()
  });

  const placement = createPlacementMode({
    map,
    onPlace: (coordinates) => {
      draftMarker.show(coordinates);
      syncButton();
      form.openForAdd(coordinates, { returnFocus: addButton });
    },
    onCancel: () => syncButton()
  });

  function syncButton() {
    addButton.setAttribute('aria-pressed', String(placement.isActive()));
  }

  function handleSubmit(values) {
    try {
      store.add(values);
      draftMarker.clear();
      form.closeAsSaved();
    } catch (error) {
      if (error instanceof ValidationError) {
        const unmapped = form.showFieldErrors(error.errors);
        if (unmapped.length > 0) {
          form.showFormError(unmapped.map((field) => error.errors[field]).join(' '));
        }
        return;
      }

      if (error instanceof StorageFullError) {
        form.showFormError(STORAGE_FULL_MESSAGE);
        return;
      }

      form.showFormError(UNEXPECTED_MESSAGE);
      console.error(error);
    }
  }

  addButton.addEventListener('click', () => {
    placement.toggle();
    syncButton();
  });

  if (isDevHost()) {
    window.waypoints = store;
  }
}

document.addEventListener('DOMContentLoaded', boot);
