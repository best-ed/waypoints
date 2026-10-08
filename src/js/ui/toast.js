const DISMISS_AFTER_MS = 6000;

export function createToast({ container, dismissAfterMs = DISMISS_AFTER_MS }) {
  let timer = null;
  let expire = null;

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  /* Runs when a toast goes away without its action being taken: the timer ran out, or a
     newer toast replaced it. Taking the action clears this first, so an undone delete
     never expires. */
  function runExpiry() {
    const onExpire = expire;
    expire = null;
    if (onExpire) {
      onExpire();
    }
  }

  function hide() {
    clearTimer();
    container.replaceChildren();
    runExpiry();
  }

  /* Showing a second toast replaces the first rather than stacking. The action the
     previous toast offered is simply gone - its deletion stands. */
  function show({ message, actionLabel, onAction, onExpire = null }) {
    clearTimer();
    runExpiry();
    expire = onExpire;

    const toast = document.createElement('div');
    toast.className = 'toast';

    const text = document.createElement('span');
    text.className = 'toast-message';
    text.textContent = message;
    toast.append(text);

    if (actionLabel) {
      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'button button-sm toast-action';
      action.textContent = actionLabel;
      action.addEventListener('click', () => {
        expire = null;
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
