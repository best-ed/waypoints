import {
  APP_VERSION,
  MAP_CONTAINER_ID
} from './config.js';
import { createMap } from './map/create-map.js';
import { createMemoryStore } from './data/memory-store.js';
import { createIdFactory } from './data/make-id.js';
import { createPlacementMode } from './map/placement-mode.js';
import { createDraftMarker } from './map/draft-marker.js';
import { createMarkersLayer } from './map/markers-layer.js';
import { createClusterIcon, enableClusterKeyboard } from './map/cluster-icon.js';
import { createBasemapControl } from './map/basemap-control.js';
import { readBasemapId, writeBasemapId } from './map/basemap-preference.js';
import { createMoveMode } from './map/move-mode.js';
import { focusMarker, openMarkerPopup } from './map/focus-marker.js';
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
import { createFiltersPanel } from './ui/filters-panel.js';
import { createActiveFilters } from './ui/active-filters.js';
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
import { createThumbnailOwner } from './ui/thumbnail-owner.js';
import { createEmptyLibrary } from './ui/empty-library.js';
import { createPlacementHint } from './ui/placement-hint.js';
import { createSidebarToggle } from './ui/sidebar-toggle.js';
import { applyIcons, createIcon } from './ui/icons.js';
import { createViewSwitch, LIST_VIEW, MAP_VIEW } from './ui/view-switch.js';
import { prefersReducedMotion } from './ui/motion.js';
import { createMemoryForm } from './ui/memory-form.js';
import { createSettingsDialog } from './ui/settings-dialog.js';
import { createSettingsStore } from './data/settings-store.js';
import { applyMapDimming, applyTheme, effectiveTheme, watchSystemTheme } from './ui/theme.js';
import { buildExport, exportFilename } from './io/export-format.js';
import { downloadText } from './io/download.js';
import { checkFileSize, readImport, ImportError } from './io/parse-import.js';
import { writeImportedPhotos } from './photos/import-photos.js';
import { createImportDialog } from './ui/import-dialog.js';
import { buildPopupContent, findPhotoStrip } from './ui/popup-content.js';
import { createPopupPhotos } from './ui/popup-photos.js';
import { createOfflineBanner } from './ui/offline-banner.js';
import { createInstallPrompt } from './ui/install-prompt.js';
import { createLightbox } from './ui/lightbox.js';
import { createToast } from './ui/toast.js';
import { ValidationError, StorageFullError } from './data/errors.js';
import { createPhotoRepository } from './photos/photo-repository.js';
import { createIndexedDbBackend } from './photos/indexeddb-backend.js';
import { buildSearch, isSandbox, storageNamesFor, wantsServiceWorker } from './dev/sandbox.js';
import {
  applyUpdate,
  onFirstControl,
  registerServiceWorker,
  removeServiceWorkers,
  shouldRegister,
  UPDATE_ACTION_LABEL,
  UPDATE_READY_MESSAGE
} from './sw-register.js';
import { warmTileCache } from './map/warm-tile-cache.js';
import { buildDevApi, isDevHost } from './dev/dev-api.js';
import { generateSeedMemories } from './dev/seed-memories.js';
import { writeEnvelope } from './data/storage.js';
import { processImage } from './photos/process-image.js';
import { checkFile } from './photos/photo-rules.js';
import { computeOrphans } from './photos/orphans.js';
import { createPhotoPicker } from './ui/photo-picker.js';

const STORAGE_FULL_MESSAGE =
  'There is no room left in this browser to save another memory. Remove one and try again.';
const UNEXPECTED_MESSAGE = 'Something went wrong saving this memory. Please try again.';
const UNDO_FAILED_MESSAGE = 'That memory could not be brought back.';
const MOVE_FAILED_MESSAGE = 'That pin could not be moved.';
const PHOTO_LOAD_FAILED_MESSAGE = 'The photos for that memory could not be opened.';

function boot() {
  /* Before anything else renders. The markup says which icon each control wants through a
     data attribute, and this is the one place that turns that into a node. */
  applyIcons(document);

  /* Decided once, before anything is read, so no code path can see one mode for the
     memories and another for the photos. */
  const sandbox = isSandbox(window.location.search);
  const names = storageNamesFor(sandbox);
  const swFlag = wantsServiceWorker(window.location.search);

  if (sandbox) {
    document.getElementById('sandbox-banner').hidden = false;
  }

  const map = createMap(MAP_CONTAINER_ID, { reducedMotion: prefersReducedMotion() });

  const makeId = createIdFactory(window.crypto);
  const now = () => new Date();

  const store = createMemoryStore({ storage: window.localStorage, now, makeId, names });

  const settings = createSettingsStore({
    storage: window.localStorage,
    key: names.settingsKey
  });

  /* Before the map draws, so the tiles are never painted bright and then turned over. The
     stylesheet decides whether the attribute means anything, which is only in dark. */
  applyMapDimming(settings.get().dimMapInDark);

  /* Declared before the basemap control, which assigns it: a let assigned above its own
     declaration would throw on boot. Replaced once the control exists. */
  let onEffectiveThemeChange = () => {};

  const photos = createPhotoRepository({
    backend: createIndexedDbBackend({ databaseName: names.databaseName })
  });

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

  createOfflineBanner({
    banner: document.getElementById('offline-banner'),
    text: document.getElementById('offline-banner-text'),
    dismissButton: document.getElementById('offline-banner-dismiss'),
    target: window,
    isOnline: () => window.navigator.onLine
  });

  /* Quietly, at the bottom of Settings. textContent, so it is one string in one place. */
  document.getElementById('app-version').textContent = 'waypoints ' + APP_VERSION;

  createInstallPrompt({
    section: document.getElementById('install-section'),
    button: document.getElementById('install-button'),
    target: window,
    onError: (error) => console.error(error)
  });

  const addButton = document.getElementById('add-memory');
  const toast = createToast({ container: document.getElementById('toast-region') });

  const selection = createSelection();
  const filters = createFilterState();
  const lightbox = createLightbox({ reducedMotion: prefersReducedMotion });

  const popupPhotos = createPopupPhotos({
    loadPhotos: (ids) => loadPhotos(ids),
    onOpenLightbox: (records, index, memory, trigger) =>
      lightbox.open(records, index, memory, trigger)
  });

  const markers = createMarkersLayer(map, {
    /* The plugin reads animate once, when the group is built. */
    animate: !prefersReducedMotion(),
    iconCreateFunction: createClusterIcon,
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
        onToggleTag: (tag) => filters.toggleTag(tag),
        onClose: () => closePopupFor(memory.id)
      }),
    /* The photo strip is filled from onPopupContent, not here: Leaflet rebuilds the content
       on paths that never fire popupopen. */
    onPopupOpen: (id) => {
      selection.select(id);
      /* Playback opens the current stop's popup itself, so only a different marker counts
         as the user taking over. */
      if (journeyActive && id !== currentStopId()) {
        pauseForInteraction();
      }
    },
    onPopupContent: (id) => fillPopupPhotos(id),
    /* Switching markers closes the old popup after the new id is already selected, so
       only the popup that still owns the selection is allowed to clear it. */
    onPopupClose: (id) => {
      popupPhotos.release();
      if (selection.getSelected() === id) {
        selection.clear();
      }
    }
  });

  const basemaps = createBasemapControl(map, {
    initialId: readBasemapId(window.localStorage),
    initialTheme: effectiveTheme(settings.get().theme),
    onChange: (id) => writeBasemapId(window.localStorage, id)
  });

  /* Now that the control exists, theme changes reach the tiles. */
  onEffectiveThemeChange = (next) => basemaps.setTheme(next);

  enableClusterKeyboard(map);

  const draftMarker = createDraftMarker(map);

  /* Every object URL the list creates belongs to this, and it is the only thing that
     revokes one. Bounded in both directions: a capped number held at once, and a capped
     number of reads in flight, so flinging a long list cannot queue a thousand reads or
     hold a thousand blobs. */
  const listThumbnails = createThumbnailOwner({
    loadThumb: async (photoId) => (await photos.get(photoId))?.thumb ?? null,
    onError: (error) => console.error(error)
  });

  const list = createMemoryList({
    thumbnails: listThumbnails,
    listElement: document.getElementById('memory-list'),
    emptyElement: document.getElementById('memory-empty'),
    countElement: document.getElementById('memory-count'),
    onSelect: (id) => selectFromList(id),
    onClearSearch: () => clearEveryFilter()
  });

  const moveMode = createMoveMode({
    onMoved: (id, coordinates) => applyMove(id, coordinates),
    /* Clustering comes back whichever way the move ended, including an Escape revert. */
    onEnd: () => restoreClustering()
  });

  createSidebarToggle({
    toggleButton: document.getElementById('sidebar-toggle'),
    sidebar: document.getElementById('sidebar'),
    onResize: () => map.invalidateSize()
  });

  /* A Leaflet map that was display:none has a stale idea of its own size, so every path that
     brings the map back on screen tells it to measure again. */
  const viewSwitch = createViewSwitch({
    container: document.getElementById('view-switch'),
    mapButton: document.getElementById('view-map'),
    listButton: document.getElementById('view-list'),
    bodyElement: document.querySelector('.app-body'),
    onShowMap: () => map.invalidateSize()
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

  let totalMemories = 0;

  function renderAll(memories) {
    totalMemories = memories.length;
    emptyLibrary.render(memories.length);

    /* Pruned before anything reads the filters, so a tag whose last memory just went
       does not keep narrowing the list from a chip that no longer exists. */
    filters.pruneTags(allTags(memories));

    const current = filters.getFilters();
    const visible = applyFilters(memories, current);

    dropSelectionIfHidden(new Set(visible.map((memory) => memory.id)));

    markers.sync(visible);
    list.render(visible, { total: memories.length, query: current.query, filters: current });

    activeFilters.render(current);
    filtersPanel.render(current);
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
    rangeElement: document.getElementById('timeline-range'),
    onChange: (range) => filters.setDateRange(range)
  });

  const summary = createFilterSummary({
    summaryElement: document.getElementById('memory-count')
  });

  function clearEveryFilter() {
    search.clear({ focus: false });
    filters.clear();
  }

  const filtersPanel = createFiltersPanel({
    toggleElement: document.getElementById('filters-toggle'),
    panelElement: document.getElementById('filters-panel'),
    badgeElement: document.getElementById('filters-badge'),
    storage: window.localStorage,
    /* Its own key, and the sandbox gets its own too: remembering a panel is a convenience,
       but a session on seeded data should not change how the real one opens. */
    storageKey: names.settingsKey + ':filters-open'
  });

  const activeFilters = createActiveFilters({
    listElement: document.getElementById('active-filters'),
    onRemove: (change) => filters.patch(change),
    onClearAll: () => clearEveryFilter(),
    createIcon
  });

  const journeyPath = createJourneyPath(map);
  const journeyChevrons = createJourneyChevrons(map);

  const playback = createPlayback({
    setTimeout: (callback, delay) => window.setTimeout(callback, delay),
    clearTimeout: (handle) => window.clearTimeout(handle)
  });

  let journeyActive = false;
  let journeyStops = [];

  const emptyLibrary = createEmptyLibrary({
    controlsElement: document.getElementById('sidebar-controls'),
    welcomeElement: document.getElementById('welcome'),
    addButton: document.getElementById('welcome-add'),
    importButton: document.getElementById('welcome-import'),
    onAdd: () => {
      placement.toggle();
      syncButton();
    },
    onImport: () => openSettingsAtImport()
  });

  const journeyPanel = createJourneyPanel({
    containerElement: document.querySelector('.journey'),
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

    journeyPanel.render({ summary: journeySummary(visible), isActive: journeyActive, total: totalMemories });
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
    focusMarker(map, marker, {
      reducedMotion: prefersReducedMotion(),
      clusterGroup: markers.clusterGroup()
    });
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
    /* First, so the numbering and the fit both see individual pins rather than clusters. */
    markers.setClustering(false);
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
    markers.setClustering(true);
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

  /* Anything the user does deliberately takes the map back from playback. Without this the
     dwell timer keeps running underneath them and yanks the view away mid-look. pause is a
     no-op unless something is actually playing, so this needs no guard of its own. */
  function pauseForInteraction() {
    playback.pause();
  }

  map.on('dragstart', pauseForInteraction);

  /* replaceState, not pushState: filtering is not navigation, and a history entry per
     keystroke would bury whatever page the user arrived from. */
  function writeFiltersToUrl(current) {
    const search = buildSearch(serializeFilters(current).toString(), { sandbox, sw: swFlag });

    window.history.replaceState(null, '', window.location.pathname + search);
  }

  filters.subscribe((current) => {
    writeFiltersToUrl(current);
    /* A filter change rebuilds the journey, so the position in the old one means nothing.
       Back to idle rather than resuming at a stop that may not even be in it any more. */
    playback.reset();
    rerender();
  });

  /* Restored before the first render, so the map and list never flash the unfiltered
     set on the way to the filtered one. */
  const fromUrl = parseFilters(window.location.search);
  filters.setQuery(fromUrl.query);
  filters.setTags(fromUrl.tags);
  filters.setDateRange({ from: fromUrl.from, to: fromUrl.to });
  search.setValue(fromUrl.query);

  /* After the filters are restored and before the first render: a filtered view arriving from
     a bookmark with the panel shut would show a short list and no reason for it. */
  filtersPanel.start(filters.getFilters());

  rerender();

  /* On a phone with nothing saved, the map is empty and the welcome is in the other pane, so
     the first thing a new person sees is a blank map and no explanation. Only at boot, so it
     never overrides a choice made during the session. */
  if (store.list().length === 0 && viewSwitch.isNarrow()) {
    viewSwitch.setView(LIST_VIEW);
  }
  store.subscribe(renderAll);

  function selectFromList(id) {
    const marker = markers.getMarker(id);
    if (!marker) {
      return;
    }

    /* Picking something in the list on a narrow screen means wanting to see it on the map, so
       the view follows. The map is shown before focusMarker runs, because flying to a marker
       on a map of the wrong size lands in the wrong place. */
    if (viewSwitch.isNarrow() && viewSwitch.current() === LIST_VIEW) {
      viewSwitch.showMap();
    }
    if (journeyActive && id !== currentStopId()) {
      pauseForInteraction();
    }
    selection.select(id);
    focusMarker(map, marker, {
      reducedMotion: prefersReducedMotion(),
      clusterGroup: markers.clusterGroup()
    });
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

  /* The setting is checked before the request is built, not after it comes back: with
     suggestions off, placing a pin must send nothing to Nominatim at all. The hint is cleared
     too, so the form does not sit there saying it is looking something up. */
  async function suggestPlaceName(coordinates) {
    cancelPlaceLookup();

    if (!settings.get().suggestPlaceNames) {
      form.showPlaceHint(false);
      return;
    }

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

  const placementHint = createPlacementHint({
    element: document.getElementById('placement-hint')
  });

  /* Every path in and out of placement goes through here, which is what keeps the hint from
     outliving the mode: the toggle, a placed pin, Escape, and the add dialog closing. */
  function syncButton() {
    const active = placement.isActive();
    addButton.setAttribute('aria-pressed', String(active));
    placementHint.render(active);
  }

  function markerElement(id) {
    const marker = markers.getMarker(id);
    return marker ? marker.getElement() : null;
  }

  function closePopupFor(id) {
    markers.getMarker(id)?.closePopup();
  }

  function openPopupFor(id) {
    const marker = markers.getMarker(id);
    if (marker) {
      openMarkerPopup(map, marker, {
        clusterGroup: markers.clusterGroup(),
        reducedMotion: prefersReducedMotion()
      });
    }
  }

  function fillPopupPhotos(id) {
    const memory = store.get(id);
    const marker = markers.getMarker(id);
    if (!memory || !marker || memory.photoIds.length === 0) {
      return;
    }

    /* The popup content is a function now, so getContent would hand back the function
       itself. The rendered element is what has the photo strip in it. */
    const popupElement = marker.getPopup().getElement();
    const strip = popupElement ? findPhotoStrip(popupElement) : null;
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

    pauseForInteraction();

    /* Closed before the dialog opens so the popup that reopens afterwards is rebuilt
       from the saved record rather than left showing the old values behind the modal. */
    markers.getMarker(id).closePopup();

    const existingPhotos = await loadPhotos(memory.photoIds);
    form.openForEdit(memory, { returnFocus: markerElement(id), photos: existingPhotos });
  }

  /* Journey mode owns the unclustered state while it is on, so a move ending inside it must
     not switch clustering back on underneath it. */
  function restoreClustering() {
    markers.setClustering(!journeyActive);
  }

  function startMove(id) {
    const marker = markers.getMarker(id);
    if (!marker) {
      return;
    }

    /* Before move-mode starts, not after: a clustered marker has no element to add the
       dragging class to, and unclustering replaces the element it would have grabbed. */
    markers.setClustering(false);
    moveMode.start(id, marker);
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

  const exportButton = document.getElementById('export-button');
  const exportStatus = document.getElementById('export-status');
  const exportIncludePhotos = document.getElementById('export-include-photos');

  /* Every stored photo is loaded, not just the referenced ones, because an id a memory points
     at is exactly what has to end up in the file. computeOrphans has already swept anything
     nothing refers to. */
  async function loadAllPhotoRecords(memories) {
    const wanted = new Set(memories.flatMap((memory) => memory.photoIds));
    const records = [];

    for (const photoId of wanted) {
      const record = await photos.get(photoId);
      if (record) {
        records.push(record);
      }
    }

    return records;
  }

  async function runExport() {
    const includePhotos = exportIncludePhotos.checked;

    exportButton.disabled = true;
    exportStatus.textContent = includePhotos ? 'Reading photos...' : 'Building the file...';

    try {
      const memories = store.list();
      const photoRecords = includePhotos ? await loadAllPhotoRecords(memories) : [];
      const envelope = await buildExport({ memories, photoRecords, includePhotos, now });

      downloadText(exportFilename(now()), JSON.stringify(envelope, null, 2));

      exportStatus.textContent =
        'Exported ' + memories.length + (memories.length === 1 ? ' memory' : ' memories') +
        (includePhotos ? ' and ' + photoRecords.length + ' photos.' : ', without photos.');
    } catch (error) {
      exportStatus.textContent = 'That export could not be built.';
      console.error(error);
    } finally {
      exportButton.disabled = false;
    }
  }

  exportButton.addEventListener('click', () => {
    runExport().catch((error) => console.error(error));
  });

  /* The boot script has already set the attribute from storage; this keeps it in step
     with the setting for the rest of the session. */
  function changeTheme(theme) {
    applyTheme(theme);
    onEffectiveThemeChange(effectiveTheme(theme));
  }

  /* A session left on "system" follows the OS without a reload. */
  watchSystemTheme(() => {
    if (settings.get().theme === 'system') {
      onEffectiveThemeChange(effectiveTheme('system'));
    }
  });

  /* On a narrow screen the list may be in the other view, where skipping to it would move
     focus to something nobody can see. The link brings the list up first. */
  document.querySelector('.skip-link').addEventListener('click', () => {
    if (viewSwitch.isNarrow()) {
      viewSwitch.setView(LIST_VIEW);
    }
  });

  const importInput = document.getElementById('import-input');
  const importStatus = document.getElementById('import-status');
  const settingsButton = document.getElementById('open-settings');

  const importDialog = createImportDialog({
    dialog: document.getElementById('import-dialog'),
    summaryElement: document.getElementById('import-summary'),
    countsElement: document.getElementById('import-counts'),
    skippedElement: document.getElementById('import-skipped'),
    skippedSummaryElement: document.getElementById('import-skipped-summary'),
    skippedListElement: document.getElementById('import-skipped-list'),
    progressElement: document.getElementById('import-progress'),
    errorElement: document.getElementById('import-error'),
    cancelButton: document.getElementById('import-cancel'),
    confirmButton: document.getElementById('import-confirm'),
    onConfirm: (plan) => {
      applyImport(plan).catch((error) => console.error(error));
    }
  });

  /* Read and checked in full before anything is shown, so the preview describes exactly what
     would happen rather than a guess that gets corrected half way through writing. */
  async function previewImport(file) {
    importStatus.textContent = 'Reading the file...';

    try {
      checkFileSize(file.size);

      const plan = readImport(await file.text(), {
        existingMemories: store.list(),
        existingPhotoIds: await photos.listIds()
      });

      importStatus.textContent = '';
      importDialog.showPlan(plan, { returnFocus: settingsButton });
    } catch (error) {
      /* An ImportError already carries a message written for the person reading it. */
      importStatus.textContent =
        error instanceof ImportError ? error.message : 'That file could not be read.';

      if (!(error instanceof ImportError)) {
        console.error(error);
      }
    }
  }

  /* Photos first, then the memories, because a memory record must never reference a blob that
     is not there yet. If the merge then fails, the blobs just written are removed, so a failed
     import leaves nothing behind either way. */
  async function applyImport(plan) {
    importDialog.setBusy(true);
    importDialog.setProgress(
      plan.photosToWrite.length > 0 ? 'Importing photos 0 of ' + plan.photosToWrite.length : 'Importing...'
    );

    let written = [];

    try {
      const photoResult = await writeImportedPhotos(plan.photosToWrite, {
        repository: photos,
        /* The decode check proper: only an actual decode tells an image from bytes claiming to
           be one. */
        decode: (blob) => createImageBitmap(blob),
        reprocess: (blob, options) => processImage(blob, options),
        onProgress: (done, total) =>
          importDialog.setProgress('Importing photos ' + done + ' of ' + total),
        now
      });

      written = photoResult.written;

      const merged = store.merge(plan.records);

      importDialog.showResult({ ...merged, photos: written.length });
    } catch (error) {
      if (written.length > 0) {
        await photos.removeMany(written).catch((removeError) => console.error(removeError));
      }

      if (error instanceof StorageFullError) {
        importDialog.showError(STORAGE_FULL_MESSAGE);
        return;
      }

      if (error instanceof ValidationError) {
        importDialog.showError('That file holds a memory this version cannot store.');
        return;
      }

      importDialog.showError('That import could not be completed, so nothing was changed.');
      console.error(error);
    } finally {
      importDialog.setBusy(false);
    }
  }

  importInput.addEventListener('change', () => {
    const [file] = importInput.files;
    /* Cleared straight away, so picking the same file twice still fires a change event. */
    importInput.value = '';

    if (file) {
      previewImport(file).catch((error) => console.error(error));
    }
  });

  const settingsDialog = createSettingsDialog({
    dialog: document.getElementById('settings-dialog'),
    openButton: document.getElementById('open-settings'),
    closeButton: document.getElementById('settings-close'),
    toggleElement: document.getElementById('setting-suggest-place-names'),
    usageElement: document.getElementById('storage-usage'),
    themeElement: document.getElementById('setting-theme'),
    dimMapElement: document.getElementById('setting-dim-map'),
    persistedElement: document.getElementById('storage-persisted'),
    settings,
    onThemeChange: (theme) => changeTheme(theme),
    onDimMapChange: (enabled) => applyMapDimming(enabled),
    /* A status line from a previous export should not still be sitting there next time. */
    onOpen: () => {
      exportStatus.textContent = '';
      importStatus.textContent = '';
    }
  });

  /* Opens Settings and takes the viewer to the import section, rather than to the top of a
     panel and a hunt for it. The section is not focusable, so focus goes to the control that
     does the thing. */
  function openSettingsAtImport() {
    settingsDialog.open();
    const pick = document.querySelector('.import-pick');
    pick?.scrollIntoView({ block: 'center' });
    document.getElementById('import-input')?.focus();
  }

  sweepOrphanedPhotos().catch((error) => console.error(error));

  addButton.addEventListener('click', () => {
    placement.toggle();
    syncButton();
  });

  /* Capture phase deliberately. Placement and move mode attach their own Escape handlers to
     document while they are active, and this one needs the first look so it can stand aside:
     by the bubble phase those modes may already have cancelled themselves, and a single
     Escape would then both cancel the placement and drop out of journey mode. */
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || !journeyActive) {
        return;
      }

      const target = event.target;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target && target.isContentEditable);

      /* Escape belongs to whatever is already using it: a field being cleared, an open
         dialog, a pin mid-placement or mid-move. */
      if (
        typing ||
        document.querySelector('dialog[open]') ||
        placement.isActive() ||
        moveMode.isMoving()
      ) {
        return;
      }

      exitJourney();
    },
    true
  );

  /* Writes the envelope and reloads rather than calling store.add a thousand times: a
     thousand validations, writes and notifications would take far longer than the reload, and
     the point of seeding is to get to a populated app quickly. */
  function seed(count) {
    const memories = generateSeedMemories(count, { now });
    writeEnvelope(window.localStorage, memories, names);
    window.location.reload();
    return memories.length;
  }

  function clearSandbox() {
    writeEnvelope(window.localStorage, [], names);
    /* The seeds carry no photos, but a hand-added one in sandbox mode would, and clearing
       should mean clearing. */
    window.indexedDB.deleteDatabase(names.databaseName);
    window.location.reload();
  }

  const devApi = buildDevApi(store, {
    sandbox,
    devHost: isDevHost(window.location.hostname),
    seed,
    clearSandbox
  });

  if (devApi) {
    window.waypoints = devApi;
  }

  /* Last, and deliberately not awaited: registering is housekeeping, and nothing above it
     should wait on the network for a worker that only matters next time. */
  const serviceWorkerSupported = 'serviceWorker' in window.navigator;

  if (
    !shouldRegister({
      hostname: window.location.hostname,
      search: window.location.search,
      supported: serviceWorkerSupported
    })
  ) {
    /* A development host without the flag clears any worker a previous ?sw visit left behind,
       so the flag turns it off as well as on. Takes effect from the next load: unregistering
       does not release the page already being controlled. */
    if (serviceWorkerSupported && isDevHost(window.location.hostname)) {
      removeServiceWorkers({
        serviceWorker: window.navigator.serviceWorker,
        cacheStorage: window.caches
      }).catch((error) => console.error(error));
    }
  } else {
    /* A first visit draws its tiles long before the worker finishes installing, so they never
       pass through it. Once it takes over, they are asked for again and cached. */
    onFirstControl({
      serviceWorker: window.navigator.serviceWorker,
      onTakeOver: () => warmTileCache(document.getElementById('map'))
    });

    registerServiceWorker({
      serviceWorker: window.navigator.serviceWorker,
      onUpdateReady: (worker) => {
        toast.show({
          message: UPDATE_READY_MESSAGE,
          actionLabel: UPDATE_ACTION_LABEL,
          onAction: () =>
            applyUpdate({
              serviceWorker: window.navigator.serviceWorker,
              worker,
              reload: () => window.location.reload()
            })
        });
      }
    }).catch((error) => {
      /* A worker that will not register costs offline support and nothing else, so it must
         not take the page down with it. */
      console.error(error);
    });
  }
}

document.addEventListener('DOMContentLoaded', boot);
