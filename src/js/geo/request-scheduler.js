export const MIN_INTERVAL_MS = 1000;
export const TIMEOUT_MS = 8000;

export class RequestTimeoutError extends Error {
  constructor(message = 'The request took too long') {
    super(message);
    this.name = 'RequestTimeoutError';
  }
}

export class RequestSupersededError extends Error {
  constructor(message = 'A newer request replaced this one') {
    super(message);
    this.name = 'RequestSupersededError';
  }
}

/* Every call to Nominatim in the app goes through one of these. The spacing is the
   usage policy made structural: it cannot be bypassed by adding another call site,
   because there is only one queue and one clock governing all of them.

   now, setTimeout and fetch are injected so the whole thing runs under a fake clock in
   node without waiting a real second per request. */
export function createRequestScheduler({
  fetch: fetchImpl,
  now = () => Date.now(),
  setTimeout: setTimeoutImpl = setTimeout,
  clearTimeout: clearTimeoutImpl = clearTimeout,
  minIntervalMs = MIN_INTERVAL_MS,
  timeoutMs = TIMEOUT_MS
}) {
  let lastStartedAt = -Infinity;
  let queueTail = Promise.resolve();
  let currentController = null;

  function wait(ms) {
    if (ms <= 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => setTimeoutImpl(resolve, ms));
  }

  function delayBeforeNext() {
    return lastStartedAt + minIntervalMs - now();
  }

  /* Only the newest request matters: an older one still in flight is aborted rather
     than left to resolve into a stale result. */
  function supersede() {
    if (currentController) {
      currentController.abort(new RequestSupersededError());
      currentController = null;
    }
  }

  /* init carries anything fetch understands - headers above all, since Nominatim wants
     an Accept-Language. The signal is this scheduler's own and always wins. */
  async function run(url, { signal, ...init } = {}) {
    supersede();

    const controller = new AbortController();
    currentController = controller;

    if (signal) {
      if (signal.aborted) {
        throw new RequestSupersededError();
      }
      signal.addEventListener('abort', () => controller.abort(new RequestSupersededError()), {
        once: true
      });
    }

    const task = queueTail.then(async () => {
      await wait(delayBeforeNext());

      if (controller.signal.aborted) {
        throw new RequestSupersededError();
      }

      lastStartedAt = now();

      let timedOut = false;
      const timer = setTimeoutImpl(() => {
        timedOut = true;
        controller.abort(new RequestTimeoutError());
      }, timeoutMs);

      try {
        return await fetchImpl(url, { ...init, signal: controller.signal });
      } catch (error) {
        throw timedOut ? new RequestTimeoutError() : error;
      } finally {
        clearTimeoutImpl(timer);
        if (currentController === controller) {
          currentController = null;
        }
      }
    });

    /* The queue advances whether this request worked or not, so one failure does not
       wedge every request after it. */
    queueTail = task.then(
      () => undefined,
      () => undefined
    );

    return task;
  }

  return {
    run,
    abortCurrent: supersede,
    lastStartedAt: () => lastStartedAt
  };
}
