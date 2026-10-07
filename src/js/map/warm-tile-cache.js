/* cors and omit, matching how the tile layers ask for them, so this does not store a second
   copy under a different request. */
const FETCH_OPTIONS = { mode: 'cors', credentials: 'omit' };

/* Asks for the tiles that are already on screen a second time, so they pass through the
   service worker and land in its tile cache.

   Why this is needed at all: on a first visit the map has drawn its opening view long before
   the worker finishes installing, so those tiles were fetched by an uncontrolled page and the
   worker never saw them. Measured on Day 13: nothing at all in the tile cache until something
   moved the map.

   Why a fetch rather than layer.redraw(): redraw removes every tile and asks for them again,
   which blanks the map for a moment. These requests are answered from the browser's own HTTP
   cache - the images finished loading seconds ago - so nothing is drawn, nothing flickers, and
   the worker still gets to store what comes back.

   Reads the rendered <img> elements rather than the layer's private _tiles, so it depends on
   Leaflet's DOM and not on its internals. */
export function warmTileCache(container, { fetchTile = (url) => fetch(url, FETCH_OPTIONS) } = {}) {
  if (!container) {
    return 0;
  }

  const sources = new Set();

  for (const image of container.querySelectorAll('img.leaflet-tile')) {
    if (image.src) {
      sources.add(image.src);
    }
  }

  for (const url of sources) {
    /* Nothing waits on these and nothing reports them. A tile that fails to warm is a tile
       that gets fetched again next time, which is the situation we were already in.

       The try is not redundant with the catch: Promise.resolve only wraps what fetchTile
       returns, so a synchronous throw would escape it and abandon every tile after this one. */
    try {
      Promise.resolve(fetchTile(url)).catch(() => {});
    } catch {
      /* as above */
    }
  }

  return sources.size;
}
