import { SELECT_ZOOM } from '../config.js';

const RESULT_PIN_SVG = [
  '<svg class="pin-svg" viewBox="0 0 26 34" width="26" height="34" aria-hidden="true" focusable="false">',
  '<path class="pin-body" d="M13 1C6.9 1 2 5.9 2 12c0 8.2 11 21 11 21s11-12.8 11-21c0-6.1-4.9-11-11-11z"/>',
  '<circle class="pin-centre" cx="13" cy="12" r="4.2"/>',
  '</svg>'
].join('');

/* Deliberately unlike a saved pin: this one is a search result, not a memory, and it
   disappears the moment the search moves on. */
function createResultIcon() {
  return L.divIcon({
    html: RESULT_PIN_SVG,
    className: 'pin pin-result',
    iconSize: [26, 34],
    iconAnchor: [13, 34],
    popupAnchor: [0, -30]
  });
}

function buildPopup(result, onAddHere) {
  const root = document.createElement('div');
  root.className = 'result-popup';

  const name = document.createElement('h2');
  name.className = 'result-popup-title';
  /* Remote text, so textContent. */
  name.textContent = result.name;
  root.append(name);

  const detail = document.createElement('p');
  detail.className = 'result-popup-detail';
  detail.textContent = result.displayName;
  root.append(detail);

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'button button-primary result-popup-add';
  add.textContent = 'Add memory here';
  add.addEventListener('click', () => onAddHere(result));
  root.append(add);

  return root;
}

export function createResultMarker({ map, onAddHere, reducedMotion = () => false }) {
  let marker = null;

  function clear() {
    if (marker) {
      marker.remove();
      marker = null;
    }
  }

  function fitTo(result) {
    const animate = !reducedMotion();

    if (result.bounds) {
      map.fitBounds(result.bounds, { animate, maxZoom: SELECT_ZOOM });
    } else {
      map.setView([result.lat, result.lng], SELECT_ZOOM, { animate });
    }
  }

  function show(result) {
    clear();
    fitTo(result);

    marker = L.marker([result.lat, result.lng], { icon: createResultIcon(), keyboard: true })
      .addTo(map)
      .bindPopup(buildPopup(result, onAddHere));

    const element = marker.getElement();
    if (element) {
      element.setAttribute('aria-label', result.name);
    }

    marker.openPopup();
    /* A result the user dismissed has served its purpose and should not linger. */
    marker.on('popupclose', clear);

    return marker;
  }

  return { show, clear, isShown: () => marker !== null };
}
