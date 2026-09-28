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
import { prefersReducedMotion } from './ui/motion.js';
import { createMemoryForm } from './ui/memory-form.js';
import { buildPopupContent } from './ui/popup-content.js';
import { createToast } from './ui/toast.js';
import { ValidationError, StorageFullError } from './data/errors.js';
import { createPhotoRepository } from './photos/photo-repository.js';
import { createIndexedDbBackend } from './photos/indexeddb-backend.js';
import { processImage } from './photos/process-image.js';
import { checkFile } from './photos/photo-rules.js';
import { createPhotoPicker } from './ui/photo-picker.js';

const DEV_HOSTNAMES = ['localhost', '127.0.0.1', '[::1]', '::1'];

const STORAGE_FULL_MESSAGE =
  'There is no room left in this browser to save another memory. Remove one and try again.';
const UNEXPECTED_MESSAGE = 'Something went wrong saving this memory. Please try again.';
const UNDO_FAILED_MESSAGE = 'That memory could not be brought back.';
const MOVE_FAILED_MESSAGE = 'That pin could not be moved.';
const PHOTO_LOAD_FAILED_MESSAGE = 'The photos for that memory could not be opened.';

function isDevHost() {
  return DEV_HOSTNAMES.includes(window.location.hostname);
}

function boot() {
  const map = createMap(MAP_CONTAINER_ID);

  const makeId = createIdFactory(window.crypto);
  const now = () => new Date();

  const store = createMemoryStore({ storage: window.localStorage, now, makeId });

  const photos = createPhotoRepository({ backend: createIndexedDbBackend() });

  /* One file failing must not take the rest of the selection down with it, so each is
     checked and decoded on its own and reported by name. */
  async function processFiles(files) {
    const records = [];
    const errors = [];

    for (const file of files) {
      const check = checkFile(file);
      if (!check.ok) {
        errors.push(file.name + ': ' + check.reason);
        continue;
      }

      try {
        records.push(await processImage(file, { makeId, now }));
      } catch (error) {
        errors.push(file.name + ': could not be read');
        console.error(error);
      }
    }

    return { records, errors };
  }

  const photoPicker = createPhotoPicker({
    gridElement: document.getElementById('memory-photos'),
    inputElement: document.getElementById('memory-photo-input'),
    countElement: document.getElementById('memory-photos-count'),
    errorElement: document.getElementById('memory-photos-errors'),
    processFiles
  });

  const addButton = document.getElementById('add-memory');
  const toast = createToast({ container: document.getElementById('toast-region') });

  const selection = createSelection();

  const markers = createMarkersLayer(map, {
    renderPopup: (memory) =>
      buildPopupContent(memory, {
        onEdit: () => {
          startEdit(memory.id).catch((error) => {
            toast.show({ message: PHOTO_LOAD_FAILED_MESSAGE });
            console.error(error);
          });
        },
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
    focusMarker(map, marker, { reducedMotion: prefersReducedMotion() });
  }

  const form = createMemoryForm({
    photoPicker,
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

  async function loadPhotos(photoIds) {
    const loaded = [];
    for (const photoId of photoIds) {
      const record = await photos.get(photoId);
      if (record) {
        loaded.push(record);
      }
    }
    return loaded;
  }

  async function startEdit(id) {
    const memory = store.get(id);
    if (!memory) {
      return;
    }

    /* Closed before the dialog opens so the popup that reopens afterwards is rebuilt
       from the saved record rather than left showing the old values behind the modal. */
    markers.getMarker(id).closePopup();

    const existingPhotos = await loadPhotos(memory.photoIds);
    form.openForEdit(memory, { returnFocus: markerElement(id), photos: existingPhotos });
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

    /* Read before the delete: afterwards the memory is gone from the order. */
    const position = list.getOrder().indexOf(id);

    if (selection.getSelected() === id) {
      selection.clear();
    }

    store.remove(id);
    list.focusAtPosition(position);

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
      /* Last, so it wins over anything the reopened popup does with focus. */
      list.focusItem(memory.id);
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

  /* Photos are written first because the memory record has to reference ids that already
     exist. If the memory then fails to save, those blobs are deleted again so a rejected
     save leaves nothing behind. */
  async function saveWithPhotos(values, context) {
    const { photoIds, pendingRecords, removedExistingIds } = context.photos;
    const written = [];

    try {
      for (const record of pendingRecords) {
        await photos.put(record);
        written.push(record.id);
      }

      const id = save({ ...values, photoIds }, context);
      await photos.removeMany(removedExistingIds);
      return id;
    } catch (error) {
      await photos.removeMany(written);
      throw error;
    }
  }

  async function handleSubmit(values, context) {
    form.setBusy(true);

    try {
      const id = await saveWithPhotos(values, context);
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
    } finally {
      form.setBusy(false);
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
