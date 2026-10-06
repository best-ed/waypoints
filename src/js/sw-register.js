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
