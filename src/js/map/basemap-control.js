import { BASEMAPS, DEFAULT_BASEMAP_ID } from '../config.js';
import { resolveBasemapId } from './basemap-preference.js';

function buildTileLayer(basemap) {
  return L.tileLayer(basemap.url, {
    attribution: basemap.attribution,
    maxZoom: basemap.maxZoom,
    ...(basemap.subdomains ? { subdomains: basemap.subdomains } : {})
  });
}

export function createBasemapControl(map, { initialId = DEFAULT_BASEMAP_ID, onChange = () => {} } = {}) {
  const layers = new Map();
  const buttons = new Map();
  let currentId = null;

  /* Built once each and kept, so switching back and forth does not throw away a warm tile
     cache and refetch everything. */
  function layerFor(id) {
    if (!layers.has(id)) {
      layers.set(id, buildTileLayer(BASEMAPS[id]));
    }
    return layers.get(id);
  }

  function markButtons() {
    for (const [id, button] of buttons) {
      button.setAttribute('aria-pressed', String(id === currentId));
    }
  }

  function select(requestedId, { notify = true } = {}) {
    const id = resolveBasemapId(requestedId);

    if (id === currentId) {
      return;
    }

    const next = layerFor(id);

    /* The old layer comes off before the new one goes on. Leaflet's attribution control adds
       and removes each layer's credit along with the layer itself, so there is no attribution
       to manage by hand and no way for a stale one to be left stacked behind the new one. */
    if (currentId !== null) {
      map.removeLayer(layerFor(currentId));
    }

    next.addTo(map);
    currentId = id;
    markButtons();

    if (notify) {
      onChange(id);
    }
  }

  const container = L.DomUtil.create('div', 'leaflet-control basemap-control');
  const group = document.createElement('div');
  group.className = 'basemap-options';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Basemap');

  for (const [id, basemap] of Object.entries(BASEMAPS)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'basemap-option';
    /* A static label from our own config, but textContent regardless - no markup strings. */
    button.textContent = basemap.label;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => select(id));

    group.append(button);
    buttons.set(id, button);
  }

  container.append(group);

  /* Without these the map pans under a drag on the control and zooms on a scroll over it. */
  L.DomEvent.disableClickPropagation(container);
  L.DomEvent.disableScrollPropagation(container);

  const control = L.control({ position: 'bottomleft' });
  control.onAdd = () => container;
  control.addTo(map);

  /* The stored choice is applied without notifying, or boot would immediately write back the
     value it just read. */
  select(initialId, { notify: false });

  return { select, current: () => currentId };
}
