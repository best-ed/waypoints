/* A textarea that is as tall as what is in it, up to a point.

   The note is the field with no predictable length: three lines for most memories and thirty
   for the one somebody actually wanted to write down. A fixed three rows made that second
   case a two-inch window scrolled by hand, and a fixed thirty left a crater in the form for
   everyone else.

   The cap is in CSS as max-height, not here, so the number lives with the rest of the sizing
   and this only has to measure. Past it the browser scrolls the textarea, which is the right
   answer: at some point a dialog that keeps growing is worse than one that scrolls. */

export function createAutoGrow(element, { window: view = window } = {}) {
  /* scrollHeight is content plus padding and stops short of the border, while box-sizing
     makes height include it. Measured once: it cannot change without a stylesheet change,
     and reading computed styles on every keystroke is a layout read nobody needs. */
  let borders = null;

  function borderHeight() {
    if (borders === null) {
      const style = view.getComputedStyle(element);
      borders = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
      if (!Number.isFinite(borders)) {
        borders = 0;
      }
    }
    return borders;
  }

  /* auto first, then measure. Without it scrollHeight can never come back down, because the
     height set last time is holding the box open and the content always fits. */
  function fit() {
    element.style.height = 'auto';
    element.style.height = element.scrollHeight + borderHeight() + 'px';
  }

  element.addEventListener('input', fit);

  return {
    fit,
    /* The form reuses one textarea for every memory it opens, so the height has to be
       recomputed whenever the value is replaced rather than only when it is typed into. */
    reset: () => {
      element.style.height = '';
      fit();
    }
  };
}
