import { MAP_CONTAINER_ID } from './config.js';
import { createMap } from './map/create-map.js';
import { createMemoryStore } from './data/memory-store.js';
import { createIdFactory } from './data/make-id.js';
import { createPlacementMode } from './map/placement-mode.js';
import { createDraftMarker } from './map/draft-marker.js';
import { createMarkersLayer } from './map/markers-layer.js';
import { createMoveMode } from './map/move-mode.js';
import { focusMarker } from './map/focus-marker.js';
import { createPlaceSearchControl } from './map/place-search-control.js';
import { createResultMarker } from './map/result-marker.js';
import { createRequestScheduler } from './geo/request-scheduler.js';
import { createNominatimClient, PlaceSearchError } from './geo/nominatim-client.js';
import { RequestSupersededError } from './geo/request-scheduler.js';
import { createSelection } from './ui/selection.js';
import { createFilterState } from './filters/filter-state.js';
import { applyFilters } from './filters/apply-filters.js';
import { serializeFilters, parseFilters } from './filters/filter-url.js';
import { createSearchInput } from './ui/search-input.js';
import { createTagBar } from './ui/tag-bar.js';
import { createDateRange } from './ui/date-range.js';
import { createTimelineView } from './ui/timeline-view.js';
import { createFilterSummary } from './ui/filter-summary.js';
import { tagCounts, allTags } from './filters/tag-counts.js';
import { timelineBuckets, distinctDateCount } from './filters/timeline.js';
import { journeyOrder } from './journey/journey-order.js';
import { journeySummary } from './journey/journey-summary.js';
import { createPlayback, IDLE } from './journey/playback.js';
import { createJourneyPath } from './map/journey-path.js';
import { createJourneyChevrons } from './map/journey-chevrons.js';
import { createJourneyPanel } from './ui/journey-panel.js';
import { createJourneyControls } from './ui/journey-controls.js';
import { createMemoryList } from './ui/memory-list.js';
import { createSidebarToggle } from './ui/sidebar-toggle.js';
import { prefersReducedMotion } from './ui/motion.js';
import { createMemoryForm } from './ui/memory-form.js';
import { buildPopupContent, findPhotoStrip } from './ui/popup-content.js';
import { createPopupPhotos } from './ui/popup-photos.js';
import { createLightbox } from './ui/lightbox.js';
import { createToast } from './ui/toast.js';
import { ValidationError, StorageFullError } from './data/errors.js';
import { createPhotoRepository } from './photos/photo-repository.js';
import { createIndexedDbBackend } from './photos/indexeddb-backend.js';
import { processImage } from './photos/process-image.js';
import { checkFile } from './photos/photo-rules.js';
import { computeOrphans } from './photos/orphans.js';
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
  const filters = createFilterState();
  const lightbox = createLightbox({});

  const popupPhotos = createPopupPhotos({
    loadPhotos: (ids) => loadPhotos(ids),
    onOpenLightbox: (records, index, memory, trigger) =>
      lightbox.open(records, index, memory, trigger)
  });

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
        onDelete: () => deleteMemory(memory.id),
        onToggleTag: (tag) => filters.toggleTag(tag)
      }),
    onPopupOpen: (id) => {
      selection.select(id);
      fillPopupPhotos(id);
    },
    /* Switching markers closes the old popup after the new id is already selected, so
       only the popup that still owns the selection is allowed to clear it. */
    onPopupClose: (id) => {
      popupPhotos.release();
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
    onSelect: (id) => selectFromList(id),
    onClearSearch: () => {
      search.clear({ focus: false });
      filters.clear();
    }
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

  /* A memory hidden by a filter must not stay selected with its popup open on a marker
     that is about to be removed. */
  function dropSelectionIfHidden(visibleIds) {
    const id = selection.getSelected();
    if (!id || visibleIds.has(id)) {
      return;
    }

    const marker = markers.getMarker(id);
    if (marker) {
      marker.closePopup();
    }
    selection.clear();
  }

  function renderAll(memories) {
    /* Pruned before anything reads the filters, so a tag whose last memory just went
       does not keep narrowing the list from a chip that no longer exists. */
    filters.pruneTags(allTags(memories));

    const current = filters.getFilters();
    const visible = applyFilters(memories, current);

    dropSelectionIfHidden(new Set(visible.map((memory) => memory.id)));

    markers.sync(visible);
    list.render(visible, { total: memories.length, query: current.query, filters: current });

    tagBar.render(tagCounts(memories, current), current.tags);
    dateRange.render(current, { visible: memories.length > 0 });
    timeline.render(timelineBuckets(memories, current), current, distinctDateCount(memories));
    summary.render(visible.length, memories.length, current);

    /* After markers.sync, so every stop already has a marker to number and fly to. */
    renderJourney(visible);
  }

  function rerender() {
    renderAll(store.list());
  }

  const search = createSearchInput({
    inputElement: document.getElementById('memory-search'),
    clearElement: document.getElementById('memory-search-clear'),
    onQueryChange: (query) => filters.setQuery(query)
  });

  const tagBar = createTagBar({
    container: document.getElementById('tag-bar'),
    listElement: document.getElementById('tag-list'),
    toggleElement: document.getElementById('tag-toggle'),
    onToggleTag: (tag) => filters.toggleTag(tag),
    onRequestRender: () => rerender()
  });

  const dateRange = createDateRange({
    container: document.getElementById('date-range'),
    fromElement: document.getElementById('filter-from'),
    toElement: document.getElementById('filter-to'),
    onChange: (range) => filters.setDateRange(range)
  });

  const timeline = createTimelineView({
    container: document.getElementById('timeline'),
    barsElement: document.getElementById('timeline-bars'),
    startElement: document.getElementById('timeline-start'),
    endElement: document.getElementById('timeline-end'),
    onChange: (range) => filters.setDateRange(range)
  });

  const summary = createFilterSummary({
    summaryElement: document.getElementById('memory-count'),
    resetElement: document.getElementById('filter-reset'),
    onReset: () => {
      search.clear({ focus: false });
      filters.clear();
    }
  });

  const journeyPath = createJourneyPath(map);
  const journeyChevrons = createJourneyChevrons(map);

  const playback = createPlayback({
    setTimeout: (callback, delay) => window.setTimeout(callback, delay),
    clearTimeout: (handle) => window.clearTimeout(handle)
  });

  let journeyActive = false;
  let journeyStops = [];

  const journeyPanel = createJourneyPanel({
    toggleElement: document.getElementById('journey-toggle'),
    hintElement: document.getElementById('journey-hint'),
    summaryElement: document.getElementById('journey-summary'),
    onToggle: () => toggleJourney()
  });

  const journeyControls = createJourneyControls({
    container: document.getElementById('journey-controls'),
    playElement: document.getElementById('journey-play'),
    previousElement: document.getElementById('journey-previous'),
    nextElement: document.getElementById('journey-next'),
    progressElement: document.getElementById('journey-progress'),
    onToggle: () => playback.toggle(),
    onPrevious: () => playback.prev(),
    onNext: () => playback.next()
  });

  function visibleNow() {
    return applyFilters(store.list(), filters.getFilters());
  }

  function currentStopId() {
    const stop = journeyStops[playback.getState().index];
    return stop ? stop.id : null;
  }

  /* Idle means there is no position in the journey yet, so nothing is behind the playhead and
     the whole path stays at full strength. */
  function highlightProgress({ status, index }) {
    const activeIndex = status === IDLE ? null : index;
    journeyPath.setProgress(activeIndex);
    journeyChevrons.setProgress(activeIndex);
  }

  function renderJourney(visible) {
    journeyStops = journeyActive ? journeyOrder(visible) : [];

    if (journeyActive) {
      journeyPath.render(journeyStops);
      journeyChevrons.render(journeyStops);
      markers.setJourney(journeyStops.map((memory) => memory.id));
      playback.setCount(journeyStops.length);
      highlightProgress(playback.getState());
    }

    journeyPanel.render({ summary: journeySummary(visible), isActive: journeyActive });
    journeyControls.render(playback.getState(), { isActive: journeyActive });
  }

  /* One step of playback: select it so the sidebar follows, then focusMarker moves the map
     and opens the popup. Selecting first is what stops the outgoing popup's close from
     clearing the incoming selection. */
  function showStop(index) {
    const stop = journeyStops[index];
    if (!stop) {
      return;
    }

    const marker = markers.getMarker(stop.id);
    if (!marker) {
      return;
    }

    selection.select(stop.id);
    focusMarker(map, marker, { reducedMotion: prefersReducedMotion() });
  }

  playback.subscribe((state) => {
    journeyControls.render(state, { isActive: journeyActive });
    highlightProgress(state);

    /* Idle is a reset rather than a position, so it must not drag the map anywhere. */
    if (!journeyActive || state.status === IDLE || state.count === 0) {
      return;
    }

    showStop(state.index);
  });

  function enterJourney() {
    journeyActive = true;
    renderJourney(visibleNow());
    playback.reset();
    journeyPath.fit(journeyStops, { reducedMotion: prefersReducedMotion() });
  }

  /* Everything journey mode added comes back off, and reset clears the dwell timer through
     the playback machine's single clear site. */
  function exitJourney() {
    journeyActive = false;
    playback.reset();
    playback.setCount(0);
    journeyPath.clear();
    journeyChevrons.clear();
    markers.setJourney(null);
    journeyStops = [];
    renderJourney(visibleNow());
    journeyPanel.focus();
  }

  function toggleJourney() {
    if (journeyActive) {
      exitJourney();
      return;
    }
    enterJourney();
  }

  /* replaceState, not pushState: filtering is not navigation, and a history entry per
     keystroke would bury whatever page the user arrived from. */
  function writeFiltersToUrl(current) {
    const params = serializeFilters(current).toString();
    const url = window.location.pathname + (params === '' ? '' : '?' + params);

    window.history.replaceState(null, '', url);
  }

  filters.subscribe((current) => {
    writeFiltersToUrl(current);
    rerender();
  });

  /* Restored before the first render, so the map and list never flash the unfiltered
     set on the way to the filtered one. */
  const fromUrl = parseFilters(window.location.search);
  filters.setQuery(fromUrl.query);
  filters.setTags(fromUrl.tags);
  filters.setDateRange({ from: fromUrl.from, to: fromUrl.to });
  search.setValue(fromUrl.query);

  rerender();
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

  let placeLookup = null;

  /* Aborted when the dialog closes, so a lookup for a pin the user has walked away from
     never lands in the next form. */
  function cancelPlaceLookup() {
    if (placeLookup) {
      placeLookup.abort();
      placeLookup = null;
    }
  }

  async function suggestPlaceName(coordinates) {
    cancelPlaceLookup();

    const controller = new AbortController();
    placeLookup = controller;
    form.showPlaceHint(true);

    try {
      const name = await places.reverse(coordinates.lat, coordinates.lng, {
        signal: controller.signal
      });

      if (!controller.signal.aborted) {
        form.suggestPlaceName(name);
      }
    } catch {
      /* Silent by design: a suggestion that did not arrive is not worth a message. */
      form.showPlaceHint(false);
    } finally {
      if (placeLookup === controller) {
        placeLookup = null;
      }
    }
  }

  const placement = createPlacementMode({
    map,
    onPlace: (coordinates) => {
      draftMarker.show(coordinates);
      syncButton();
      form.openForAdd(coordinates, { returnFocus: addButton });
      suggestPlaceName(coordinates);
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

  function fillPopupPhotos(id) {
    const memory = store.get(id);
    const marker = markers.getMarker(id);
    if (!memory || !marker || memory.photoIds.length === 0) {
      return;
    }

    const strip = findPhotoStrip(marker.getPopup().getContent());
    if (!strip) {
      return;
    }

    popupPhotos.fill(strip, memory).catch((error) => console.error(error));
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
      onAction: () => undoDelete(memory),
      /* The blobs outlive the memory record for exactly as long as undo is on offer.
         Once the toast goes without being used, the delete is final and they go too. */
      onExpire: () => {
        photos.removeMany(memory.photoIds).catch((error) => console.error(error));
      }
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
    cancelPlaceLookup();

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
      cancelPlaceLookup();
      draftMarker.clear();
      resultMarker.clear();
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

  /* Catches blobs whose memory never made it: a tab closed inside the undo window, or a
     write interrupted between the photo and the memory. Runs once, after boot, so a
     slow database read never delays the map appearing. */
  async function sweepOrphanedPhotos() {
    const storedIds = await photos.listIds();
    const orphans = computeOrphans(storedIds, store.list());

    if (orphans.length > 0) {
      await photos.removeMany(orphans);
    }
  }

  const places = createNominatimClient({
    scheduler: createRequestScheduler({ fetch: (...args) => window.fetch(...args) }),
    language: navigator.language || 'en'
  });

  const resultMarker = createResultMarker({
    map,
    reducedMotion: prefersReducedMotion,
    onAddHere: (result) => addMemoryAtResult(result)
  });

  const placeSearch = createPlaceSearchControl({
    map,
    onSearch: (query) => runPlaceSearch(query),
    onChoose: (result) => resultMarker.show(result),
    onClear: () => resultMarker.clear()
  });

  async function runPlaceSearch(query) {
    resultMarker.clear();

    try {
      const results = await places.search(query);
      placeSearch.showResults(results);
    } catch (error) {
      /* A superseded request was replaced by a newer one, so its result is no longer
         wanted and saying anything about it would be noise. */
      if (error instanceof RequestSupersededError) {
        return;
      }

      if (error instanceof PlaceSearchError) {
        placeSearch.showError(error.message);
        return;
      }

      placeSearch.showError('Place search failed. Try again.');
      console.error(error);
    }
  }

  function addMemoryAtResult(result) {
    placement.disable();
    syncButton();

    const coordinates = { lat: result.lat, lng: result.lng };
    draftMarker.show(coordinates);
    form.openForAdd(coordinates, { returnFocus: addButton, placeName: result.name });
  }

  sweepOrphanedPhotos().catch((error) => console.error(error));

  addButton.addEventListener('click', () => {
    placement.toggle();
    syncButton();
  });

  if (isDevHost()) {
    window.waypoints = store;
  }
}

document.addEventListener('DOMContentLoaded', boot);
