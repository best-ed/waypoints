/* The pin the journey has just arrived at, said once and briefly.

   Playback flies the map and opens a popup, which is plenty on a sparse map and nothing at all
   where the next stop is forty pixels from the last one. A pulse on the pin itself says which
   of them the journey is on now.

   How it looks is entirely in the stylesheet, including whether it moves at all: the duration
   is a motion token, so reduced motion takes it to zero, and under forced colours the pin
   takes a visible outline instead of an animation. This only puts the class on and takes it
   off again. */

export const PULSE_CLASS = 'pin-arriving';

/* Long enough to cover the animation and be gone before the next stop at the fastest speed. */
export const PULSE_MS = 900;

export function createArrivalPulse({
  setTimeout: setTimer = (callback, delay) => window.setTimeout(callback, delay),
  clearTimeout: clearTimer = (handle) => window.clearTimeout(handle)
} = {}) {
  let pulsing = null;
  let timer = null;

  function stop() {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }

    if (pulsing) {
      pulsing.classList.remove(PULSE_CLASS);
      pulsing = null;
    }
  }

  function pulse(element) {
    stop();

    if (!element) {
      return;
    }

    pulsing = element;

    /* Reading a layout property between the remove and the add is what makes the animation
       start over. Without it, stepping to the next stop inside the previous pulse adds a class
       the element already had a moment ago and the browser does nothing at all. */
    void element.offsetWidth;

    element.classList.add(PULSE_CLASS);
    timer = setTimer(stop, PULSE_MS);
  }

  return { pulse, stop };
}
