import { createPinIcon } from './pin-icon.js';

/* Everything the popup and tooltip actually show. Compared as a whole so a change to any
   displayed field refreshes the popup, while an untouched memory keeps its DOM node. */
function displaySignature(memory) {
  return JSON.stringify([memory.title, memory.date, memory.placeName, memory.note, memory.tags]);
}

export function createMarkersLayer(map, { renderPopup }) {
  const group = L.layerGroup().addTo(map);
  const markersById = new Map();

  function add(memory) {
    const marker = L.marker([memory.lat, memory.lng], { icon: createPinIcon() });
    marker.bindTooltip(memory.title);
    marker.bindPopup(renderPopup(memory));
    marker.addTo(group);

    markersById.set(memory.id, {
      marker,
      lat: memory.lat,
      lng: memory.lng,
      title: memory.title,
      signature: displaySignature(memory)
    });
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

  function getMarker(id) {
    const entry = markersById.get(id);
    return entry ? entry.marker : null;
  }

  return { sync, getMarker, count: () => markersById.size };
}
