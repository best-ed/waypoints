export function createDraftMarker(map) {
  let marker = null;

  function show({ lat, lng }) {
    clear();
    /* Above saved markers so the point being edited is never hidden behind one. */
    marker = L.marker([lat, lng], { zIndexOffset: 1000, keyboard: false }).addTo(map);
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
