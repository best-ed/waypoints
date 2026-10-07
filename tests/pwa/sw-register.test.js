import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';

import {
  applyUpdate,
  onFirstControl,
  registerServiceWorker,
  removeServiceWorkers,
  shouldRegister,
  SERVICE_WORKER_URL
} from '../../src/js/sw-register.js';

const DEV_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1'];

test('a real host registers with no flag at all', () => {
  for (const hostname of ['waypoints.example', 'example.github.io']) {
    assert.equal(shouldRegister({ hostname, search: '', supported: true }), true, hostname);
  }
});

test('a development host needs the sw flag', () => {
  for (const hostname of DEV_HOSTS) {
    assert.equal(shouldRegister({ hostname, search: '', supported: true }), false, hostname);
    assert.equal(shouldRegister({ hostname, search: '?sw', supported: true }), true, hostname);
  }
});

test('the flag survives alongside the others on a development host', () => {
  assert.equal(
    shouldRegister({ hostname: 'localhost', search: '?sandbox&sw&q=sunset', supported: true }),
    true
  );
});

test('an unrelated flag does not turn it on', () => {
  assert.equal(
    shouldRegister({ hostname: 'localhost', search: '?sandbox&q=sw', supported: true }),
    false
  );
});

test('nothing registers where service workers do not exist', () => {
  /* An insecure context has no navigator.serviceWorker, which is why the app over a LAN
     address never registers one. */
  assert.equal(shouldRegister({ hostname: 'waypoints.example', search: '', supported: false }), false);
  assert.equal(shouldRegister({ hostname: '192.168.1.20', search: '?sw', supported: false }), false);
});

test('a LAN address is not a development host, so it would register if it could', () => {
  assert.equal(shouldRegister({ hostname: '192.168.1.20', search: '', supported: true }), true);
});

/* ------------------------------------------------------------- registration */

function fakeServiceWorker({ controller = null, registration } = {}) {
  const listeners = new Map();

  return {
    controller,
    registered: [],
    register(url, options) {
      this.registered.push({ url, options });
      return Promise.resolve(registration);
    },
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    fire(type, event) {
      const handler = listeners.get(type);
      if (handler) handler(event);
    }
  };
}

function fakeRegistration({ waiting = null } = {}) {
  const listeners = new Map();

  return {
    waiting,
    installing: null,
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    fire(type) {
      const handler = listeners.get(type);
      if (handler) handler();
    }
  };
}

function fakeWorker() {
  const listeners = new Map();

  return {
    state: 'installing',
    posted: [],
    postMessage(message) {
      this.posted.push(message);
    },
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    fire(type) {
      const handler = listeners.get(type);
      if (handler) handler();
    }
  };
}

test('registers the worker at the root with updateViaCache off', async () => {
  const registration = fakeRegistration();
  const serviceWorker = fakeServiceWorker({ registration });

  await registerServiceWorker({ serviceWorker });

  assert.equal(serviceWorker.registered.length, 1);
  assert.equal(serviceWorker.registered[0].url, SERVICE_WORKER_URL);
  assert.deepEqual(serviceWorker.registered[0].options, { updateViaCache: 'none' });
});

test('a worker already waiting from a previous session is offered at once', async () => {
  const waiting = fakeWorker();
  const registration = fakeRegistration({ waiting });
  const serviceWorker = fakeServiceWorker({ registration, controller: {} });

  const offered = [];
  await registerServiceWorker({ serviceWorker, onUpdateReady: (worker) => offered.push(worker) });

  assert.deepEqual(offered, [waiting]);
});

test('a waiting worker with nothing controlling the page is not an update', async () => {
  /* Only reachable if a previous install never activated. Announcing a new version to someone
     who has only ever had this one would be nonsense. */
  const registration = fakeRegistration({ waiting: fakeWorker() });
  const serviceWorker = fakeServiceWorker({ registration, controller: null });

  const offered = [];
  await registerServiceWorker({ serviceWorker, onUpdateReady: (worker) => offered.push(worker) });

  assert.deepEqual(offered, []);
});

test('a worker that installs while the page is open is offered', async () => {
  const registration = fakeRegistration();
  const serviceWorker = fakeServiceWorker({ registration, controller: {} });

  const offered = [];
  await registerServiceWorker({ serviceWorker, onUpdateReady: (worker) => offered.push(worker) });

  const installing = fakeWorker();
  registration.installing = installing;
  registration.fire('updatefound');

  installing.state = 'installing';
  installing.fire('statechange');
  assert.deepEqual(offered, [], 'nothing is offered until it has installed');

  installing.state = 'installed';
  installing.fire('statechange');
  assert.deepEqual(offered, [installing]);
});

test('the very first install is not announced as an update', async () => {
  const registration = fakeRegistration();
  const serviceWorker = fakeServiceWorker({ registration, controller: null });

  const offered = [];
  await registerServiceWorker({ serviceWorker, onUpdateReady: (worker) => offered.push(worker) });

  const installing = fakeWorker();
  registration.installing = installing;
  registration.fire('updatefound');
  installing.state = 'installed';
  installing.fire('statechange');

  assert.deepEqual(offered, []);
});

test('an updatefound with nothing installing is ignored', async () => {
  const registration = fakeRegistration();
  const serviceWorker = fakeServiceWorker({ registration, controller: {} });

  await registerServiceWorker({ serviceWorker, onUpdateReady: () => {} });

  registration.installing = null;
  assert.doesNotThrow(() => registration.fire('updatefound'));
});

/* -------------------------------------------------------------- applying it */

test('taking the action tells the worker to skip waiting', () => {
  const worker = fakeWorker();
  const serviceWorker = fakeServiceWorker({ registration: fakeRegistration() });

  applyUpdate({ serviceWorker, worker, reload: () => {} });

  assert.deepEqual(worker.posted, ['skip-waiting']);
});

test('the page reloads only once the controller has actually changed', () => {
  const worker = fakeWorker();
  const serviceWorker = fakeServiceWorker({ registration: fakeRegistration() });

  let reloads = 0;
  applyUpdate({ serviceWorker, worker, reload: () => (reloads += 1) });

  assert.equal(reloads, 0, 'posting the message must not reload on its own');

  serviceWorker.fire('controllerchange');
  assert.equal(reloads, 1);
});

test('a second controllerchange does not reload again', () => {
  const serviceWorker = fakeServiceWorker({ registration: fakeRegistration() });

  let reloads = 0;
  applyUpdate({ serviceWorker, worker: fakeWorker(), reload: () => (reloads += 1) });

  serviceWorker.fire('controllerchange');
  serviceWorker.fire('controllerchange');

  assert.equal(reloads, 1);
});

test('nothing listens for controllerchange until the action is taken', () => {
  /* activate calls clients.claim, so a first install fires controllerchange, and so does
     another tab taking the update. Arming the listener on the click is what keeps the page
     from reloading under someone who never asked for it. */
  const registration = fakeRegistration();
  const serviceWorker = fakeServiceWorker({ registration, controller: {} });

  let reloads = 0;
  registerServiceWorker({ serviceWorker, onUpdateReady: () => {} });

  serviceWorker.fire('controllerchange');
  assert.equal(reloads, 0);
});

/* ------------------------------------------------------- turning it back off */

function fakeCacheStorage(names) {
  return {
    deleted: [],
    keys: () => Promise.resolve(names),
    delete(name) {
      this.deleted.push(name);
      return Promise.resolve(true);
    }
  };
}

function fakeRegistry(count) {
  const registrations = Array.from({ length: count }, () => ({
    unregistered: false,
    unregister() {
      this.unregistered = true;
      return Promise.resolve(true);
    }
  }));

  return { registrations, getRegistrations: () => Promise.resolve(registrations) };
}

test('removing unregisters every worker it finds', async () => {
  const registry = fakeRegistry(2);

  const removed = await removeServiceWorkers({ serviceWorker: registry, cacheStorage: null });

  assert.equal(removed, 2);
  assert.ok(registry.registrations.every((r) => r.unregistered));
});

test('removing takes our caches with it and leaves everything else alone', async () => {
  const cacheStorage = fakeCacheStorage([
    'waypoints-precache-aaa',
    'waypoints-tiles',
    'something-else'
  ]);

  await removeServiceWorkers({ serviceWorker: fakeRegistry(1), cacheStorage });

  assert.deepEqual(cacheStorage.deleted, ['waypoints-precache-aaa', 'waypoints-tiles']);
});

test('removing copes with nothing being registered', async () => {
  const cacheStorage = fakeCacheStorage([]);

  assert.equal(await removeServiceWorkers({ serviceWorker: fakeRegistry(0), cacheStorage }), 0);
});

test('removing works where CacheStorage is missing', async () => {
  /* Only reachable in an odd browser, but an absent caches object must not throw on the way
     out of a cleanup path. */
  assert.equal(
    await removeServiceWorkers({ serviceWorker: fakeRegistry(1), cacheStorage: undefined }),
    1
  );
});

/* --------------------------------------------------- taking over a first visit */

test('a page with no controller is told when a worker takes over', () => {
  const serviceWorker = fakeServiceWorker({ registration: fakeRegistration(), controller: null });

  let takenOver = 0;
  const armed = onFirstControl({ serviceWorker, onTakeOver: () => (takenOver += 1) });

  assert.equal(armed, true);
  assert.equal(takenOver, 0, 'nothing happens until the worker actually takes over');

  serviceWorker.fire('controllerchange');
  assert.equal(takenOver, 1);
});

test('a page that already has a controller is not armed at all', () => {
  /* There is nothing to warm: everything this page asked for went through the worker. */
  const serviceWorker = fakeServiceWorker({ registration: fakeRegistration(), controller: {} });

  let takenOver = 0;
  const armed = onFirstControl({ serviceWorker, onTakeOver: () => (takenOver += 1) });

  assert.equal(armed, false);
  serviceWorker.fire('controllerchange');
  assert.equal(takenOver, 0);
});

test('taking over never reloads anything', () => {
  /* Deliberately separate from applyUpdate: that listener is armed by a click because it
     reloads, this one must fire on its own because it does not. */
  const serviceWorker = fakeServiceWorker({ registration: fakeRegistration(), controller: null });
  const source = readFileSync(new URL('../../src/js/sw-register.js', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('export function onFirstControl'), source.indexOf('export async function registerServiceWorker'));

  assert.doesNotMatch(body, /reload/);
  onFirstControl({ serviceWorker, onTakeOver: () => {} });
});
