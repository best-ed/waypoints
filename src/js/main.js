import { MAP_CONTAINER_ID } from './config.js';
import { createMap } from './map/create-map.js';
import { createMemoryStore } from './data/memory-store.js';
import { createIdFactory } from './data/make-id.js';
import { createPlacementMode } from './map/placement-mode.js';
import { createDraftMarker } from './map/draft-marker.js';
import { createMarkersLayer } from './map/markers-layer.js';
import { createMoveMode } from './map/move-mode.js';
import { focusMarker } from './map/focus-marker.js';
import { createSelection } from './ui/selection.js';
import { createMemoryList } from './ui/memory-list.js';
import { createSidebarToggle } from './ui/sidebar-toggle.js';
import { createMemoryForm } from './ui/memory-form.js';
import { buildPopupContent } from './ui/popup-content.js';
import { createToast } from './ui/toast.js';
import { ValidationError, StorageFullError } from './data/errors.js';

const DEV_HOSTNAMES = ['localhost', '127.0.0.1', '[::1]', '::1'];

const STORAGE_FULL_MESSAGE =
  'There is no room left in this browser to save another memory. Remove one and try again.';
const UNEXPECTED_MESSAGE = 'Something went wrong saving this memory. Please try again.';
const UNDO_FAILED_MESSAGE = 'That memory could not be brought back.';
const MOVE_FAILED_MESSAGE = 'That pin could not be moved.';

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
  const toast = createToast({ container: document.getElementById('toast-region') });

  const selection = createSelection();

  const markers = createMarkersLayer(map, {
    renderPopup: (memory) =>
      buildPopupContent(memory, {
        onEdit: () => startEdit(memory.id),
        onMove: () => startMove(memory.id),
        onDelete: () => deleteMemory(memory.id)
      }),
    onPopupOpen: (id) => selection.select(id),
    /* Switching markers closes the old popup after the new id is already selected, so
       only the popup that still owns the selection is allowed to clear it. */
    onPopupClose: (id) => {
      if (selection.getSelected() === id) {
        selection.clear();
      }
    }
  });

  const draftMarker = createDraftMarker(map);

  const list = createMemoryList({
    listElement: document.getElementById('memory-list'),
    emptyElement: document.getElementById('memory-empty'),
    countElement: document.getElementById('memory-count'),
    onSelect: (id) => selectFromList(id)
  });

  const moveMode = createMoveMode({
    onMoved: (id, coordinates) => applyMove(id, coordinates)
  });

  createSidebarToggle({
    toggleButton: document.getElementById('sidebar-toggle'),
    sidebar: document.getElementById('sidebar'),
    onResize: () => map.invalidateSize()
  });

  selection.subscribe((id) => list.setSelected(id));

  function renderAll(memories) {
    markers.sync(memories);
    list.render(memories);
  }

  renderAll(store.list());
  store.subscribe(renderAll);

  function selectFromList(id) {
    const marker = markers.getMarker(id);
    if (!marker) {
      return;
    }
    selection.select(id);
    focusMarker(map, marker);
  }

  const form = createMemoryForm({
    onSubmit: (values, context) => handleSubmit(values, context),
    onCancel: (context) => handleCancel(context)
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

  function markerElement(id) {
    const marker = markers.getMarker(id);
    return marker ? marker.getElement() : null;
  }

  function openPopupFor(id) {
    const marker = markers.getMarker(id);
    if (marker) {
      marker.openPopup();
    }
  }

  function startEdit(id) {
    const memory = store.get(id);
    if (!memory) {
      return;
    }

    /* Closed before the dialog opens so the popup that reopens afterwards is rebuilt
       from the saved record rather than left showing the old values behind the modal. */
    markers.getMarker(id).closePopup();
    form.openForEdit(memory, { returnFocus: markerElement(id) });
  }

  function startMove(id) {
    const marker = markers.getMarker(id);
    if (marker) {
      moveMode.start(id, marker);
    }
  }

  /* The store rounds the coordinates, and the marker is then pulled onto the rounded
     position by the sync that follows. */
  function applyMove(id, coordinates) {
    try {
      store.update(id, coordinates);
      openPopupFor(id);
    } catch (error) {
      toast.show({ message: MOVE_FAILED_MESSAGE });
      console.error(error);
      markers.sync(store.list());
    }
  }

  /* The record is captured before the delete so Undo can put back the same memory,
     id and timestamps included, rather than creating a lookalike. */
  function deleteMemory(id) {
    const memory = store.get(id);
    if (!memory) {
      return;
    }

    store.remove(id);

    toast.show({
      message: 'Deleted "' + memory.title + '"',
      actionLabel: 'Undo',
      onAction: () => undoDelete(memory)
    });
  }

  function undoDelete(memory) {
    try {
      store.restore(memory);
      openPopupFor(memory.id);
    } catch (error) {
      toast.show({ message: UNDO_FAILED_MESSAGE });
      console.error(error);
    }
  }

  function handleCancel({ mode, memoryId }) {
    if (mode === 'edit') {
      /* Edit closed this popup on the way in, so reopening it leaves the screen exactly
         as the user found it. */
      openPopupFor(memoryId);
      return;
    }
    draftMarker.clear();
  }

  function save(values, { mode, memoryId }) {
    if (mode === 'edit') {
      store.update(memoryId, values);
      return memoryId;
    }
    return store.add(values).id;
  }

  function handleSubmit(values, context) {
    try {
      const id = save(values, context);
      draftMarker.clear();
      form.closeAsSaved();
      if (context.mode === 'edit') {
        openPopupFor(id);
      }
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
