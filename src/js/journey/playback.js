/* How long each stop is held before the journey moves on. Long enough to read a popup,
   short enough that a twelve-stop journey does not outlast anyone's patience. */
export const DWELL_MS = 3500;

export const IDLE = 'idle';
export const PLAYING = 'playing';
export const PAUSED = 'paused';
export const FINISHED = 'finished';

/* setTimeout and clearTimeout are injected so tests can drive the dwell with a fake clock
   instead of waiting 3.5 real seconds per stop. */
export function createPlayback({
  setTimeout: setTimer,
  clearTimeout: clearTimer,
  dwellMs = DWELL_MS,
  onListenerError
} = {}) {
  let status = IDLE;
  let index = 0;
  let count = 0;
  let timer = null;
  const listeners = new Set();

  function report(error) {
    if (typeof onListenerError === 'function') {
      onListenerError(error);
      return;
    }
    queueMicrotask(() => {
      throw error;
    });
  }

  function getState() {
    return { status, index, count };
  }

  function notify() {
    const snapshot = getState();
    for (const listener of [...listeners]) {
      try {
        listener(snapshot);
      } catch (error) {
        report(error);
      }
    }
  }

  function lastIndex() {
    return count - 1;
  }

  /* The only place the dwell timer is cleared. */
  function clearDwell() {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
  }

  /* The only place the dwell timer is set. */
  function schedule() {
    timer = setTimer(onDwell, dwellMs);
  }

  /* Every state change goes through here, and it clears any pending dwell before doing
     anything else. That is what guarantees no timer outlives the state that started it:
     there is one set site, reached only when the new status is playing, and one clear site,
     reached on every single transition. */
  function moveTo(nextStatus, nextIndex) {
    clearDwell();
    status = nextStatus;
    index = nextIndex;

    if (status === PLAYING) {
      schedule();
    }

    notify();
  }

  function onDwell() {
    /* The handle has already fired, so drop it before transitioning or clearDwell would
       clear a timer that no longer exists. */
    timer = null;

    if (status !== PLAYING) {
      return;
    }

    if (index >= lastIndex()) {
      moveTo(FINISHED, index);
      return;
    }

    moveTo(PLAYING, index + 1);
  }

  function play() {
    if (count === 0 || status === PLAYING) {
      return;
    }

    /* Playing again after the end starts over rather than sitting on the last stop. */
    moveTo(PLAYING, status === FINISHED ? 0 : index);
  }

  function pause() {
    if (status !== PLAYING) {
      return;
    }
    moveTo(PAUSED, index);
  }

  function toggle() {
    if (status === PLAYING) {
      pause();
      return;
    }
    play();
  }

  /* Stepping off the end of the journey does nothing at all - no state change, no
     notification - so a held arrow key cannot wander past the stops. */
  function next() {
    if (count === 0 || index >= lastIndex()) {
      return;
    }
    moveTo(status === PLAYING ? PLAYING : PAUSED, index + 1);
  }

  function prev() {
    if (count === 0 || index <= 0) {
      return;
    }
    moveTo(status === PLAYING ? PLAYING : PAUSED, index - 1);
  }

  function goTo(target) {
    if (!Number.isInteger(target) || target < 0 || target > lastIndex()) {
      return;
    }
    if (target === index && status !== FINISHED) {
      return;
    }
    moveTo(status === PLAYING ? PLAYING : PAUSED, target);
  }

  function reset() {
    moveTo(IDLE, 0);
  }

  /* A rebuilt journey invalidates the index, so a changed count goes back to idle. An
     unchanged count is left alone, or every unrelated re-render would stop playback. */
  function setCount(nextCount) {
    const settled = Number.isInteger(nextCount) && nextCount > 0 ? nextCount : 0;

    if (settled === count) {
      return;
    }

    count = settled;
    moveTo(IDLE, 0);
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  /* Called when journey mode exits. Clears the timer through the same single site and drops
     the listeners, so nothing can be woken up afterwards. */
  function dispose() {
    clearDwell();
    status = IDLE;
    index = 0;
    count = 0;
    listeners.clear();
  }

  return {
    getState,
    play,
    pause,
    toggle,
    next,
    prev,
    goTo,
    reset,
    setCount,
    subscribe,
    dispose
  };
}
