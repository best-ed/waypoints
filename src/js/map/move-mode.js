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

    active.marker.dragging.disable();
    active.marker.off('dragend', active.handleDragEnd);
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
