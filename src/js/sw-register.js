import { isDevHost } from './dev/dev-api.js';
import { wantsServiceWorker } from './dev/sandbox.js';

export const SERVICE_WORKER_URL = 'sw.js';
export const UPDATE_READY_MESSAGE = 'A new version is ready';
export const UPDATE_ACTION_LABEL = 'Reload';

/* On a real host the worker is simply on: that is the point of shipping one.

   On a development host it takes ?sw, because a worker that serves a cached index.html is
   exactly what you do not want while editing one - a precache from two edits ago answering
   every reload is a confusing hour. Opting in per url keeps it out of the way and still makes
   the whole thing testable locally.

   supported is false in an insecure context, where navigator.serviceWorker does not exist at
   all, so serving the app over a LAN address never registers one. */
export function shouldRegister({ hostname, search, supported }) {
  if (!supported) {
    return false;
  }

  return isDevHost(hostname) ? wantsServiceWorker(search) : true;
}

/* The other half of the ?sw gate. Without this the flag is a one way switch: one visit with
   it registers a worker that keeps serving a cached index.html on every later load, which is
   the exact problem the gate exists to avoid, except now permanent. Off a development host
   this is never reached, so a real deployment can never unregister itself.

   The caches go too. Nothing would read them with no worker registered, but leaving a hundred
   files per version lying around in storage is not what "off" should mean. */
export async function removeServiceWorkers({ serviceWorker, cacheStorage, prefix = 'waypoints-' }) {
  const registrations = await serviceWorker.getRegistrations();

  await Promise.all(registrations.map((registration) => registration.unregister()));

  if (cacheStorage) {
    const names = await cacheStorage.keys();
    await Promise.all(
      names.filter((name) => name.startsWith(prefix)).map((name) => cacheStorage.delete(name))
    );
  }

  return registrations.length;
}

/* An update is only an update if something is already controlling the page. The first install
   reaches "installed" too, and announcing a new version to someone who has just loaded the
   only version there has ever been would be nonsense. */
function isUpdate(serviceWorker) {
  return Boolean(serviceWorker.controller);
}

export async function registerServiceWorker({
  serviceWorker,
  url = SERVICE_WORKER_URL,
  onUpdateReady = () => {}
}) {
  /* updateViaCache none: the browser otherwise serves the worker script itself out of the HTTP
     cache, so an update could go unnoticed for as long as that cache lasts. */
  const registration = await serviceWorker.register(url, { updateViaCache: 'none' });

  /* A worker that finished installing in a previous session and is still waiting. Without this
     the offer is lost unless the update happens to land while the page is open. */
  if (registration.waiting && isUpdate(serviceWorker)) {
    onUpdateReady(registration.waiting);
  }

  registration.addEventListener('updatefound', () => {
    const installing = registration.installing;

    if (!installing) {
      return;
    }

    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed' && isUpdate(serviceWorker)) {
        onUpdateReady(installing);
      }
    });
  });

  return registration;
}

/* A first visit has no controller when it boots. The worker installs while the page is already
   running, so everything the page asked for before that - the opening view's map tiles above
   all - never passed through it and never reached the tile cache. clients.claim in activate
   takes over the page, but it cannot reach back and intercept requests that have already been
   made.

   So the page is told when it is taken over, and warms the cache itself. Nothing here reloads
   anything: this listener and the one in applyUpdate are deliberately separate, because that
   one must be armed by a click and this one must not be.

   once: the handler is for taking over from nothing. A later controllerchange is an update
   being applied, which reloads the page anyway. */
export function onFirstControl({ serviceWorker, onTakeOver }) {
  if (serviceWorker.controller) {
    return false;
  }

  serviceWorker.addEventListener('controllerchange', () => onTakeOver(), { once: true });
  return true;
}

/* The second half of the flow, and the only thing that ever reloads the page.

   controllerchange is listened for here rather than at registration on purpose: activate calls
   clients.claim, so a first install fires it, and so does another tab taking an update. Arming
   it only when this tab's button is pressed is what makes "never reload without the click"
   true rather than nearly true. */
export function applyUpdate({ serviceWorker, worker, reload }) {
  let reloading = false;

  serviceWorker.addEventListener('controllerchange', () => {
    /* Fires once per activation, but a guard costs nothing against a reload loop. */
    if (reloading) {
      return;
    }

    reloading = true;
    reload();
  });

  worker.postMessage('skip-waiting');
}
