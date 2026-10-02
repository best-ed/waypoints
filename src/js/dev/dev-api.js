const DEV_HOSTNAMES = Object.freeze(['localhost', '127.0.0.1', '[::1]', '::1']);

export function isDevHost(hostname) {
  return DEV_HOSTNAMES.includes(hostname);
}

/* The guard, in one place and testable. Two conditions have to hold before anything that can
   write a thousand records is reachable from the console: a development host, and sandbox
   mode. Off a dev host there is no console API at all; on one without ?sandbox there is the
   store and nothing else, so seed() cannot be aimed at real memories by leaving a flag off
   the URL. */
export function buildDevApi(store, { sandbox = false, devHost = false, seed, clearSandbox } = {}) {
  if (!devHost) {
    return null;
  }

  if (!sandbox) {
    return store;
  }

  return { ...store, seed, clearSandbox };
}
