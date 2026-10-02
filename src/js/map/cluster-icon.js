export const CLUSTER_CLASS = 'memory-cluster';

/* Three weights so a cluster's size reads at a glance. The thresholds match the plugin's own
   small/medium/large split, which keeps the sizes familiar to anyone who has used it. */
const MEDIUM_FROM = 10;
const LARGE_FROM = 100;

const SIZES = Object.freeze({
  small: 34,
  medium: 42,
  large: 50
});

function sizeFor(count) {
  if (count >= LARGE_FROM) {
    return 'large';
  }
  return count >= MEDIUM_FROM ? 'medium' : 'small';
}

/* iconCreateFunction has to return an L.Icon, and the only icon that takes arbitrary content
   is DivIcon, whose html option is documented as a string. Leaflet 1.9 also accepts an
   Element there and appends it as-is, which is what this relies on: the count goes in through
   textContent, exactly like the journey step number on a pin, and no markup string carrying
   data is built anywhere.

   A fresh element every call, because divIcon appends the very node it is handed and one node
   cannot be in two clusters at once. */
export function createClusterIcon(cluster) {
  const count = cluster.getChildCount();
  const size = sizeFor(count);

  const content = document.createElement('span');
  content.className = 'memory-cluster-content';

  /* Hidden from assistive technology: the bare number would be read as "12" with no hint of
     what it counts or what pressing it does. The span below says both. */
  const number = document.createElement('span');
  number.className = 'memory-cluster-count';
  number.setAttribute('aria-hidden', 'true');
  number.textContent = String(count);
  content.append(number);

  /* Leaflet gives a keyboard marker role="button" and tabindex="0" but sets no name on it, and
     a button with no name attribute takes one from its contents. This is that name. */
  const label = document.createElement('span');
  label.className = 'visually-hidden';
  label.textContent =
    count + (count === 1 ? ' memory' : ' memories') + ', press Enter to zoom in';
  content.append(label);

  return L.divIcon({
    html: content,
    className: CLUSTER_CLASS + ' is-' + size,
    iconSize: [SIZES[size], SIZES[size]]
  });
}

/* Leaflet forwards keypress and keydown to whichever marker has focus, but nothing in the
   cluster plugin listens for them: its _onKeyPress belongs to bindPopup, and a cluster has no
   popup bound, so out of the box neither Enter nor Space does anything at all.

   Delegated from the map container rather than bound per icon, because cluster elements are
   created and thrown away on every zoom. The synthetic click is deliberate: it goes through
   the plugin's own click path, so a cluster that cannot be split any further spiderfies
   instead of zooming, exactly as a mouse click would. */
export function enableClusterKeyboard(map) {
  function handleKeyDown(event) {
    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') {
      return;
    }

    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const icon = target.closest('.' + CLUSTER_CLASS);
    if (!icon) {
      return;
    }

    /* Space would otherwise scroll the page. */
    event.preventDefault();
    icon.click();
  }

  map.getContainer().addEventListener('keydown', handleKeyDown);

  return () => map.getContainer().removeEventListener('keydown', handleKeyDown);
}
