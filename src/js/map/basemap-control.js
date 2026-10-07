import { BASEMAPS, DEFAULT_BASEMAP_ID } from '../config.js';
import { resolveBasemapId } from './basemap-preference.js';

/* A provider only has a dark variant if it ships one. Where it does not, the light tiles are
   used in both themes rather than inventing something. */
function urlFor(basemap, theme) {
  return theme === 'dark' && basemap.darkUrl ? basemap.darkUrl : basemap.url;
}

function buildTileLayer(basemap, theme) {
  return L.tileLayer(urlFor(basemap, theme), {
    attribution: basemap.attribution,
    maxZoom: basemap.maxZoom,
    /* Leaflet leaves crossOrigin off by default, which makes every tile a no-cors request and
       every tile response opaque. An opaque response has status 0, so the service worker
       cannot tell a tile from a rate-limit page and refuses to cache either - the tile cache
       stayed empty and the map only worked offline by accident, out of the HTTP cache.

       Both providers answer with Access-Control-Allow-Origin: *, so asking for the tiles with
       CORS costs nothing and gives the worker a status it can actually read. */
    crossOrigin: 'anonymous',
    ...(basemap.subdomains ? { subdomains: basemap.subdomains } : {})
  });
}

export function createBasemapControl(
  map,
  { initialId = DEFAULT_BASEMAP_ID, initialTheme = 'light', onChange = () => {} } = {}
) {
  const layers = new Map();
  const buttons = new Map();
  let currentId = null;
  let theme = initialTheme === 'dark' ? 'dark' : 'light';

  /* Built once each and kept, so switching back and forth does not throw away a warm tile
     cache and refetch everything. */
  function layerFor(id) {
    if (!layers.has(id)) {
      layers.set(id, buildTileLayer(BASEMAPS[id], theme));
    }
    return layers.get(id);
  }

  /* setUrl on the existing layer rather than rebuilding it: the layer keeps its identity, so
     Leaflet's attribution control never sees a remove and an add, and the credit cannot
     flicker or end up stacked. Leaflet redraws the tiles itself. */
  function setTheme(nextTheme) {
    const settled = nextTheme === 'dark' ? 'dark' : 'light';

    if (settled === theme) {
      return;
    }

    theme = settled;

    for (const [id, layer] of layers) {
      const url = urlFor(BASEMAPS[id], theme);
      /* Only when it actually changes, so switching theme does not refetch every OSM tile for
         a url that was never going to differ. */
      if (layer._url !== url) {
        layer.setUrl(url);
      }
    }
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

  /* A chooser with nothing to choose between is noise over the map. The layer itself is still
     added by select() above, so the basemap works whether or not the control is shown. */
  const control = L.control({ position: 'bottomleft' });
  control.onAdd = () => container;

  if (Object.keys(BASEMAPS).length > 1) {
    control.addTo(map);
  }

  /* The stored choice is applied without notifying, or boot would immediately write back the
     value it just read. */
  select(initialId, { notify: false });

  return { select, setTheme, current: () => currentId, currentTheme: () => theme };
}
