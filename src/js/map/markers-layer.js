import { createNumberedPinIcon, createPinIcon } from './pin-icon.js';

/* Everything the popup and tooltip actually show. Compared as a whole so a change to any
   displayed field refreshes the popup, while an untouched memory keeps its DOM node. */
function displaySignature(memory) {
  return JSON.stringify([memory.title, memory.date, memory.placeName, memory.note, memory.tags]);
}

/* Leaflet gives a keyboard-enabled marker tabindex="0" and role="button" and opens its
   popup on Enter, but a divIcon has no alt text, so the title is attached by hand or the
   button reaches a screen reader with no name at all. */
function applyAccessibleName(marker, name) {
  const element = marker.getElement();
  if (element) {
    element.setAttribute('aria-label', name);
  }
}

/* The pin shows a bare number in journey mode, so the accessible name has to say what the
   number means. The title stays in it: "Step 3" alone would not identify the memory. */
function accessibleName(title, step) {
  return step === null ? title : 'Step ' + step + ': ' + title;
}

export function createMarkersLayer(map, { renderPopup, onPopupOpen = () => {}, onPopupClose = () => {} }) {
  const group = L.layerGroup().addTo(map);
  const markersById = new Map();

  /* null outside journey mode, otherwise memory id to one-based step number. */
  let stepsById = null;

  function stepFor(id) {
    return stepsById ? stepsById.get(id) ?? null : null;
  }

  /* setIcon replaces the marker's element, so the accessible name has to be reapplied
     afterwards or the new node reaches a screen reader unnamed. */
  function applyStep(entry, step) {
    entry.marker.setIcon(step === null ? createPinIcon() : createNumberedPinIcon(step));
    entry.step = step;
    applyAccessibleName(entry.marker, accessibleName(entry.title, step));
  }

  function add(memory) {
    const marker = L.marker([memory.lat, memory.lng], {
      icon: createPinIcon(),
      keyboard: true
    });
    marker.bindTooltip(memory.title);
    marker.bindPopup(renderPopup(memory));
    marker.on('popupopen', () => onPopupOpen(memory.id));
    marker.on('popupclose', () => onPopupClose(memory.id));
    marker.addTo(group);

    const entry = {
      marker,
      lat: memory.lat,
      lng: memory.lng,
      title: memory.title,
      step: null,
      signature: displaySignature(memory)
    };
    markersById.set(memory.id, entry);

    /* A memory added while journey mode is on gets its number straight away. Outside journey
       mode the icon it was built with already stands, so only the name needs attaching. */
    const step = stepFor(memory.id);
    if (step === null) {
      applyAccessibleName(marker, memory.title);
    } else {
      applyStep(entry, step);
    }
  }

  function moveIfNeeded(entry, memory) {
    if (entry.lat === memory.lat && entry.lng === memory.lng) {
      return;
    }
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
      applyAccessibleName(entry.marker, accessibleName(memory.title, entry.step));
    }

    entry.signature = signature;
  }

  /* Diffed by id rather than cleared and redrawn, so untouched markers keep their DOM
     node - a redraw would drop any open popup and make the whole layer flicker. */
  function sync(memories) {
    const liveIds = new Set();

    for (const memory of memories) {
      liveIds.add(memory.id);
      const entry = markersById.get(memory.id);
      if (entry) {
        moveIfNeeded(entry, memory);
        refreshIfNeeded(entry, memory);
      } else {
        add(memory);
      }
    }

    for (const [id, entry] of markersById) {
      if (!liveIds.has(id)) {
        entry.marker.remove();
        markersById.delete(id);
      }
    }
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
        applyStep(entry, step);
      }
    }
  }

  function getMarker(id) {
    const entry = markersById.get(id);
    return entry ? entry.marker : null;
  }

  return { sync, setJourney, getMarker, count: () => markersById.size };
}
