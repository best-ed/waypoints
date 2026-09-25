import { createPinIcon } from './pin-icon.js';

export function createMarkersLayer(map) {
  const group = L.layerGroup().addTo(map);
  const markersById = new Map();

  function add(memory) {
    const marker = L.marker([memory.lat, memory.lng], { icon: createPinIcon() });
    marker.bindTooltip(memory.title);
    marker.addTo(group);
    markersById.set(memory.id, { marker, lat: memory.lat, lng: memory.lng, title: memory.title });
  }

  function retitleIfNeeded(entry, memory) {
    if (entry.title === memory.title) {
      return;
    }
    entry.marker.setTooltipContent(memory.title);
    entry.title = memory.title;
  }

  function moveIfNeeded(entry, memory) {
    if (entry.lat === memory.lat && entry.lng === memory.lng) {
      return;
    }
    entry.marker.setLatLng([memory.lat, memory.lng]);
    entry.lat = memory.lat;
    entry.lng = memory.lng;
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
        retitleIfNeeded(entry, memory);
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

  return { sync, count: () => markersById.size };
}
