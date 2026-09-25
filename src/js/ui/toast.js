const DISMISS_AFTER_MS = 6000;

export function createToast({ container, dismissAfterMs = DISMISS_AFTER_MS }) {
  let timer = null;

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function hide() {
    clearTimer();
    container.replaceChildren();
  }

  /* Showing a second toast replaces the first rather than stacking. The action the
     previous toast offered is simply gone - its deletion stands. */
  function show({ message, actionLabel, onAction }) {
    clearTimer();

    const toast = document.createElement('div');
    toast.className = 'toast';

    const text = document.createElement('span');
    text.className = 'toast-message';
    text.textContent = message;
    toast.append(text);

    if (actionLabel) {
      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'button toast-action';
      action.textContent = actionLabel;
      action.addEventListener('click', () => {
        hide();
        onAction();
      });
      toast.append(action);
    }

    container.replaceChildren(toast);
    timer = setTimeout(hide, dismissAfterMs);
  }

  return { show, hide, isShowing: () => container.childElementCount > 0 };
}
