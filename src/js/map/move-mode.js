const MOVING_CLASS = 'pin-moving';

export function createMoveMode({ onMoved }) {
  let active = null;

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      revert();
    }
  }

  function teardown() {
    if (!active) {
      return;
    }

    /* Order matters. Disabling a marker mid-drag makes Leaflet finish the drag, which
       fires dragend. Leaflet happens to detach its own listener first so ours never
       runs, but that is its internal ordering, not a guarantee. Detaching ours first
       means an Esc revert wins regardless of what Leaflet does here. */
    active.marker.off('dragend', active.handleDragEnd);
    active.marker.dragging.disable();
    active.marker.getElement().classList.remove(MOVING_CLASS);
    document.removeEventListener('keydown', handleKeyDown);
    active = null;
  }

  function revert() {
    if (!active) {
      return;
    }

    const { marker, origin } = active;
    teardown();
    marker.setLatLng(origin);
  }

  /* Only one marker is movable at a time: starting a new move reverts whatever was
     already in flight rather than leaving two draggable pins on the map. */
  function start(id, marker) {
    revert();

    const origin = marker.getLatLng();
    const handleDragEnd = () => {
      const { lat, lng } = marker.getLatLng();
      teardown();
      onMoved(id, { lat, lng });
    };

    active = { id, marker, origin, handleDragEnd };

    marker.closePopup();
    marker.dragging.enable();
    marker.on('dragend', handleDragEnd);
    marker.getElement().classList.add(MOVING_CLASS);
    document.addEventListener('keydown', handleKeyDown);
  }

  return {
    start,
    revert,
    isMoving: () => active !== null,
    movingId: () => (active ? active.id : null)
  };
}
