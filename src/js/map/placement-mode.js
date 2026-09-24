const PLACING_CLASS = 'is-placing';

export function createPlacementMode({ map, onPlace, onCancel }) {
  let active = false;
  /* A pan ends with a native click on the map, so the click that closes a drag has to
     be swallowed instead of dropping a marker where the user let go. */
  let draggedSinceMouseDown = false;

  function handleDragStart() {
    draggedSinceMouseDown = true;
  }

  function handleMouseDown() {
    draggedSinceMouseDown = false;
  }

  function handleClick(event) {
    if (draggedSinceMouseDown) {
      draggedSinceMouseDown = false;
      return;
    }
    const { lat, lng } = event.latlng;
    disable();
    onPlace({ lat, lng });
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      cancel();
    }
  }

  function enable() {
    if (active) {
      return;
    }
    active = true;
    draggedSinceMouseDown = false;

    map.getContainer().classList.add(PLACING_CLASS);
    map.on('mousedown', handleMouseDown);
    map.on('dragstart', handleDragStart);
    map.on('click', handleClick);
    document.addEventListener('keydown', handleKeyDown);
  }

  function disable() {
    if (!active) {
      return;
    }
    active = false;

    map.getContainer().classList.remove(PLACING_CLASS);
    map.off('mousedown', handleMouseDown);
    map.off('dragstart', handleDragStart);
    map.off('click', handleClick);
    document.removeEventListener('keydown', handleKeyDown);
  }

  function cancel() {
    if (!active) {
      return;
    }
    disable();
    onCancel();
  }

  function toggle() {
    if (active) {
      cancel();
    } else {
      enable();
    }
  }

  return {
    enable,
    disable,
    cancel,
    toggle,
    isActive: () => active
  };
}
