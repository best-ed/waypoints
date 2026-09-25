import { createPinIcon } from './pin-icon.js';

export function createDraftMarker(map) {
  let marker = null;

  function show({ lat, lng }) {
    clear();
    /* Above saved markers so the point being edited is never hidden behind one. */
    marker = L.marker([lat, lng], {
      icon: createPinIcon(),
      zIndexOffset: 1000,
      keyboard: false
    }).addTo(map);
    marker.getElement().classList.add('pin-draft');
    return marker;
  }

  function clear() {
    if (marker) {
      marker.remove();
      marker = null;
    }
  }

  return { show, clear, isShown: () => marker !== null };
}
