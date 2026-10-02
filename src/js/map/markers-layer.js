import { createNumberedPinIcon, createPinIcon } from './pin-icon.js';

const CLUSTER_OPTIONS = {
  maxClusterRadius: 50,
  /* Past this zoom the pins are far enough apart to read on their own, and a cluster here
     would hide the very pin someone zoomed in to find. */
  disableClusteringAtZoom: 17,
  /* A thousand markers added in one synchronous pass locks the page. Chunking yields between
     batches, so the first paint is not held up waiting for the last marker. */
  chunkedLoading: true
};

/* Everything the popup and tooltip actually show. Compared as a whole so a change to any
   displayed field refreshes the popup, while an untouched memory keeps its DOM node. */
function displaySignature(memory) {
  return JSON.stringify([memory.title, memory.date, memory.placeName, memory.note, memory.tags]);
}

/* The pin shows a bare number in journey mode, so the accessible name has to say what the
   number means. The title stays in it: "Step 3" alone would not identify the memory. */
function accessibleName(title, step) {
  return step === null ? title : 'Step ' + step + ': ' + title;
}

function iconFor(title, step) {
  return step === null
    ? createPinIcon(title)
    : createNumberedPinIcon(step, accessibleName(title, step));
}

export function createMarkersLayer(
  map,
  { renderPopup, onPopupOpen = () => {}, onPopupClose = () => {}, iconCreateFunction, animate = true }
) {
  const clustered = L.markerClusterGroup({
    ...CLUSTER_OPTIONS,
    /* Read once at construction: the plugin reads it on every cluster transition, but there
       is no supported way to swap it afterwards, and reduced motion does not change
       mid-session in practice. */
    animate,
    ...(iconCreateFunction ? { iconCreateFunction } : {})
  });

  /* Journey and move modes need every pin individually addressable: a step cannot be numbered
     or dragged while it is folded into a cluster. Both groups stay built and the markers move
     between them, so switching is one pass over the markers rather than a rebuild. */
  const plain = L.layerGroup();

  let group = clustered;
  group.addTo(map);

  const markersById = new Map();

  /* null outside journey mode, otherwise memory id to one-based step number. */
  let stepsById = null;

  function stepFor(id) {
    return stepsById ? stepsById.get(id) ?? null : null;
  }

  /* The accessible name travels inside the icon, so setIcon is the single place either the
     number or the name changes. */
  function applyIcon(entry, step) {
    entry.step = step;
    entry.marker.setIcon(iconFor(entry.title, step));
  }

  /* Builds and registers the marker but does not put it on the group: sync collects them and
     adds the whole batch at once. See addAll below for why that matters. */
  function create(memory) {
    const step = stepFor(memory.id);

    const marker = L.marker([memory.lat, memory.lng], {
      icon: iconFor(memory.title, step),
      keyboard: true
    });
    marker.bindTooltip(memory.title);
    marker.bindPopup(renderPopup(memory));
    marker.on('popupopen', () => onPopupOpen(memory.id));
    marker.on('popupclose', () => onPopupClose(memory.id));

    markersById.set(memory.id, {
      marker,
      lat: memory.lat,
      lng: memory.lng,
      title: memory.title,
      step,
      signature: displaySignature(memory)
    });

    return marker;
  }

  /* The bulk methods exist only on the cluster group, and they are the whole point of batching
     here. Each separate addLayer re-evaluates the cluster hierarchy, so adding a thousand
     markers one at a time measured 45ms against 11ms for a single addLayers call, and removing
     them 20ms against 6ms. chunkedLoading only ever applies to this bulk path.

     A plain layer group has no bulk API and needs none: it does no clustering work per layer. */
  function addAll(batch) {
    if (batch.length === 0) {
      return;
    }

    if (group === clustered) {
      clustered.addLayers(batch);
      return;
    }

    for (const marker of batch) {
      group.addLayer(marker);
    }
  }

  function removeAll(batch) {
    if (batch.length === 0) {
      return;
    }

    if (group === clustered) {
      clustered.removeLayers(batch);
      return;
    }

    for (const marker of batch) {
      group.removeLayer(marker);
    }
  }

  function moveIfNeeded(entry, memory) {
    if (entry.lat === memory.lat && entry.lng === memory.lng) {
      return;
    }
    /* The cluster group watches its children for a move and re-clusters them, reopening the
       popup if one was open, so setLatLng is enough and no remove-and-re-add is needed. */
    entry.marker.setLatLng([memory.lat, memory.lng]);
    entry.lat = memory.lat;
    entry.lng = memory.lng;
  }

  function refreshIfNeeded(entry, memory) {
    const signature = displaySignature(memory);
    if (entry.signature === signature) {
      return;
    }

    entry.marker.setPopupContent(renderPopup(memory));

    if (entry.title !== memory.title) {
      entry.marker.setTooltipContent(memory.title);
      entry.title = memory.title;
      applyIcon(entry, entry.step);
    }

    entry.signature = signature;
  }

  /* Diffed by id rather than cleared and redrawn, so untouched markers keep their DOM
     node - a redraw would drop any open popup and make the whole layer flicker. */
  function sync(memories) {
    const liveIds = new Set();
    const added = [];
    const removed = [];

    for (const memory of memories) {
      liveIds.add(memory.id);
      const entry = markersById.get(memory.id);
      if (entry) {
        moveIfNeeded(entry, memory);
        refreshIfNeeded(entry, memory);
      } else {
        added.push(create(memory));
      }
    }

    for (const [id, entry] of markersById) {
      if (!liveIds.has(id)) {
        /* Through the group, never marker.remove(): the latter takes it off the map without
           telling the group, which would keep counting it in a cluster. */
        removed.push(entry.marker);
        markersById.delete(id);
      }
    }

    /* Removals first, so the additions are clustered against what is actually left. */
    removeAll(removed);
    addAll(added);
  }

  /* Pass the ordered ids to number the pins, or null to put them back to plain ones. Only
     markers whose number actually changed are re-iconed: setIcon rebuilds the element, which
     would otherwise close an open popup and drop focus. */
  function setJourney(orderedIds) {
    stepsById = Array.isArray(orderedIds)
      ? new Map(orderedIds.map((id, index) => [id, index + 1]))
      : null;

    for (const [id, entry] of markersById) {
      const step = stepFor(id);
      if (entry.step !== step) {
        applyIcon(entry, step);
      }
    }
  }

  function setClustering(enabled) {
    const next = enabled ? clustered : plain;

    if (next === group) {
      return;
    }

    const all = [...markersById.values()].map((entry) => entry.marker);

    removeAll(all);
    group.remove();

    group = next;
    group.addTo(map);

    addAll(all);
  }

  function getMarker(id) {
    const entry = markersById.get(id);
    return entry ? entry.marker : null;
  }

  return {
    sync,
    setJourney,
    setClustering,
    getMarker,
    /* null while unclustered, so callers do not try to reveal a marker through a group that
       is not on the map. */
    clusterGroup: () => (group === clustered ? clustered : null),
    isClustered: () => group === clustered,
    count: () => markersById.size
  };
}
