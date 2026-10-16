/* The one owner of object URLs for list thumbnails.

   Every other surface in the app has a pool with exactly one place that revokes it: the form
   picker on the dialog's close, the popup strip on popupclose, the lightbox on its own close.
   The list cannot work that way, because rows come and go as you scroll and there is no one
   moment when they are all finished with. So this owns them instead, and it is bounded in two
   directions at once:

   - **Concurrency.** At most `maxConcurrent` reads are in flight. Without that, flinging a
     list of a thousand rows queues a thousand IndexedDB reads, and the ones that matter -
     the rows you actually stopped on - are behind all of them.
   - **Live URLs.** At most `maxLive` are held. A URL that is never revoked keeps its blob
     alive, so a long scroll would hold every thumbnail it had ever passed. When the cap is
     reached the least recently asked for is revoked first.

   Everything it touches is injected, so it runs under node with a Map for a database and two
   counters for the URL API. */

export const DEFAULT_MAX_LIVE = 48;
export const DEFAULT_MAX_CONCURRENT = 4;

export function createThumbnailOwner({
  loadThumb,
  createObjectURL = (blob) => URL.createObjectURL(blob),
  revokeObjectURL = (url) => URL.revokeObjectURL(url),
  maxLive = DEFAULT_MAX_LIVE,
  maxConcurrent = DEFAULT_MAX_CONCURRENT,
  onError = () => {}
} = {}) {
  /* Insertion order is least-recently-asked-for first, which is what Map gives for free as
     long as a re-request deletes before it sets. No timestamps to keep in step. */
  const live = new Map();
  const inFlight = new Map();
  const queue = [];

  let running = 0;
  let disposed = false;

  function revoke(id) {
    const url = live.get(id);

    if (url === undefined) {
      return false;
    }

    live.delete(id);
    revokeObjectURL(url);
    return true;
  }

  /* Oldest first, and never the one just asked for: evicting the row that is on screen to
     make room for the row that is on screen is a loop. */
  function trim(keepId) {
    for (const id of [...live.keys()]) {
      if (live.size <= maxLive) {
        return;
      }
      if (id !== keepId) {
        revoke(id);
      }
    }
  }

  function pump() {
    while (running < maxConcurrent && queue.length > 0) {
      const job = queue.shift();

      if (job.cancelled) {
        job.resolve(null);
        continue;
      }

      running += 1;

      /* Called straight away rather than a microtask later, so "in flight" means the read has
         actually started. A synchronous throw is turned into a rejection here so the two
         failure shapes land in the same place. */
      let reading;
      try {
        reading = Promise.resolve(loadThumb(job.id));
      } catch (error) {
        reading = Promise.reject(error);
      }

      reading
        .then((blob) => {
          /* Released while the read was in flight, so the blob is dropped rather than turned
             into a URL nobody will ever revoke. */
          if (disposed || job.cancelled || !blob) {
            job.resolve(null);
            return;
          }

          const url = createObjectURL(blob);
          live.set(job.id, url);
          trim(job.id);
          job.resolve(live.get(job.id) ?? null);
        })
        .catch((error) => {
          onError(error);
          job.resolve(null);
        })
        .finally(() => {
          running -= 1;
          inFlight.delete(job.id);
          pump();
        });
    }
  }

  /* Resolves with a url, or null if the memory has no thumbnail, the read failed, or the row
     left before the read finished. */
  function request(id) {
    if (disposed) {
      return Promise.resolve(null);
    }

    const existing = live.get(id);

    if (existing !== undefined) {
      /* Re-inserted so it counts as recently used and is evicted last. */
      live.delete(id);
      live.set(id, existing);
      return Promise.resolve(existing);
    }

    const pending = inFlight.get(id);

    if (pending) {
      pending.cancelled = false;
      return pending.promise;
    }

    const job = { id, cancelled: false, resolve: null, promise: null };
    job.promise = new Promise((resolve) => {
      job.resolve = resolve;
    });

    inFlight.set(id, job);
    queue.push(job);
    pump();

    return job.promise;
  }

  function release(id) {
    const pending = inFlight.get(id);

    if (pending) {
      pending.cancelled = true;
    }

    return revoke(id);
  }

  function dispose() {
    disposed = true;
    for (const job of inFlight.values()) job.cancelled = true;
    for (const id of [...live.keys()]) revoke(id);
    queue.length = 0;
  }

  return {
    request,
    release,
    dispose,
    liveCount: () => live.size,
    pendingCount: () => inFlight.size,
    has: (id) => live.has(id)
  };
}
