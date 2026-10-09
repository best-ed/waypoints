/* The hint over the map while a pin is being placed.

   Placement is a mode: the next click on the map means something different from usual, and
   nothing on screen used to say so. The cursor changes, which is not much, and on a touch
   screen there is no cursor at all.

   Pinned to the top of the map rather than put in the sidebar, because the instruction is
   about where to tap and the map is where that happens. */

export const MOUSE_HINT = 'Click where it happened. Esc to cancel.';
export const TOUCH_HINT = 'Tap where it happened.';

export function createPlacementHint({
  element,
  /* Injected rather than read at module load: the query has to be asked at the moment the
     hint is shown, because a laptop with a touchscreen can be either depending on what the
     person last used. */
  matchMedia = (query) => window.matchMedia(query)
}) {
  function wording() {
    try {
      /* Escape is the other half of the mouse hint and there is no Escape key on a phone, so
         the two differ by more than the verb. */
      return matchMedia('(hover: none)').matches ? TOUCH_HINT : MOUSE_HINT;
    } catch {
      return MOUSE_HINT;
    }
  }

  function show() {
    /* Written in every time rather than once at boot: the element is a live region, and a
       live region announces a change to its contents, not a change to its visibility. */
    element.textContent = wording();
    element.hidden = false;
  }

  function hide() {
    element.hidden = true;
    element.textContent = '';
  }

  return { show, hide, render: (active) => (active ? show() : hide()) };
}
