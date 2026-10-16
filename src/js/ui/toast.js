const DISMISS_AFTER_MS = 6000;

/* A backstop, not the length of anything. The fade out is a CSS animation and the node goes
   when it ends; this only covers a browser that never fires the event, which would otherwise
   leave an invisible toast sitting over the map forever. It has to outlast --duration-base. */
const LEAVE_BACKSTOP_MS = 2000;

const LEAVING_CLASS = 'is-leaving';

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

  /* Faded out rather than cut, and the stylesheet owns how long that takes: the node goes when
     its animation ends. It is taken out of the accessibility tree and out of the way of the
     pointer first, so a toast on its way out is already gone as far as anything but the eye is
     concerned. */
  function dismiss(toast) {
    if (!toast || toast.classList.contains(LEAVING_CLASS)) {
      return;
    }

    toast.classList.add(LEAVING_CLASS);
    toast.setAttribute('aria-hidden', 'true');

    const drop = () => toast.remove();

    toast.addEventListener('animationend', drop, { once: true });
    setTimeout(drop, LEAVE_BACKSTOP_MS);
  }

  function hide() {
    clearTimer();

    for (const toast of [...container.children]) {
      dismiss(toast);
    }

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

    /* The one it replaces fades out beside it rather than being cut, and append rather than
       replaceChildren so both are in the region while that happens. */
    for (const previous of [...container.children]) {
      dismiss(previous);
    }

    container.append(toast);
    timer = setTimeout(hide, dismissAfterMs);
  }

  /* A toast on its way out is not showing. The caller asking is asking whether there is
     anything to act on. */
  return {
    show,
    hide,
    isShowing: () => container.querySelector('.toast:not(.' + LEAVING_CLASS + ')') !== null
  };
}
