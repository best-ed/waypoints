/* A movement counter for the end-to-end suite, behind the same development-host guard as the
   console API.

   The suite needs to answer "did opening a memory move the map" and had been answering it with
   proxies: the map pane's CSS transform, and later a pin's position sampled until it stopped
   changing. Both lie. Leaflet re-bases the pane to 0,0 on every `_resetView` and compensates by
   repositioning its layers, so the transform changes when nothing moved; and a sampling loop
   can decide a position is stable before an animation has started, so it reads "did not move"
   whether or not anything was about to.

   Leaflet fires `movestart` synchronously as `setView`, `flyTo`, `fitBounds` and `panTo` begin,
   and nothing in this app passes `noMoveStart`. So a count of zero means no movement was ever
   started. No settling, no sampling, no proxy.

   It is a counter and a reset and nothing else: it cannot move the map, read a memory or write
   anything. The guard is here because a test hook on a real host is still a test hook on a real
   host, and because the rule is that these things are unreachable off a dev host rather than
   harmless off a dev host. */

export function createMapMovementProbe({ devHost = false } = {}) {
  if (!devHost) {
    return null;
  }

  let started = 0;
  let ended = 0;

  return {
    /* Both wired in main.js, which is the only place that knows there is a map at all. */
    record: () => {
      started += 1;
    },
    recordEnd: () => {
      ended += 1;
    },
    movesStarted: () => started,
    /* Everything that started has finished, so the map is sitting still. This is what a test
       waits on before resetting: reset zeroes both counters, so calling it mid-flight would
       leave this saying idle while an animation is still running. */
    isIdle: () => started === ended,
    reset: () => {
      started = 0;
      ended = 0;
    }
  };
}
