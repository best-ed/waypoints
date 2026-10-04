export const NARROW_QUERY = '(max-width: 720px)';

export const MAP_VIEW = 'map';
export const LIST_VIEW = 'list';

/* On a narrow screen the sidebar and a usable map cannot share the width, so one of them is
   on screen at a time. The choice is expressed as data-view on the app body and read entirely
   by CSS; above the breakpoint the attribute is ignored and both are shown.

   onShowMap fires whenever the map comes back into view, because a Leaflet map that was
   display:none has a stale idea of its own size until invalidateSize is called. */
export function createViewSwitch({
  container,
  mapButton,
  listButton,
  bodyElement,
  onShowMap = () => {}
}) {
  const query = window.matchMedia(NARROW_QUERY);
  let view = MAP_VIEW;

  function isNarrow() {
    return query.matches;
  }

  function render() {
    container.hidden = !isNarrow();

    if (!isNarrow()) {
      /* Nothing stuck: above the breakpoint the attribute comes off entirely, so a session
         that was left on List does not come back to a hidden map. */
      bodyElement.removeAttribute('data-view');
      mapButton.setAttribute('aria-pressed', 'false');
      listButton.setAttribute('aria-pressed', 'false');
      return;
    }

    bodyElement.setAttribute('data-view', view);
    mapButton.setAttribute('aria-pressed', String(view === MAP_VIEW));
    listButton.setAttribute('aria-pressed', String(view === LIST_VIEW));
  }

  function setView(next, { focusSwitch = false } = {}) {
    const settled = next === LIST_VIEW ? LIST_VIEW : MAP_VIEW;
    const changed = settled !== view;
    view = settled;
    render();

    if (view === MAP_VIEW && isNarrow()) {
      onShowMap();
    }

    if (focusSwitch && changed) {
      (view === MAP_VIEW ? mapButton : listButton).focus();
    }
  }

  mapButton.addEventListener('click', () => setView(MAP_VIEW));
  listButton.addEventListener('click', () => setView(LIST_VIEW));

  query.addEventListener('change', () => {
    render();
    /* Coming back to a wide layout reveals the map again, so it needs its size back. */
    onShowMap();
  });

  render();

  return {
    setView,
    showMap: () => setView(MAP_VIEW),
    current: () => view,
    isNarrow
  };
}
