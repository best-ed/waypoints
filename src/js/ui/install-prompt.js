/* The install offer.

   beforeinstallprompt is Chromium's, and nothing else fires it. The section stays hidden until
   it does, because a button that cannot install anything is worse than no button at all.

   The event has to be kept: calling prompt() later needs the same event object, and the
   default has to be prevented first or the browser shows its own bar as well as ours. */
export function createInstallPrompt({ section, button, target, onError = () => {} }) {
  let deferred = null;

  function offer(event) {
    event.preventDefault();
    deferred = event;
    section.hidden = false;
  }

  function withdraw() {
    deferred = null;
    section.hidden = true;
  }

  target.addEventListener('beforeinstallprompt', offer);

  /* Fires whether the app was installed from our button or from the browser's own menu, so
     this is the one place the offer goes away. */
  target.addEventListener('appinstalled', withdraw);

  button.addEventListener('click', () => {
    if (!deferred) {
      return;
    }

    const event = deferred;

    /* Spent either way: an event that has been prompted once cannot be prompted again, so
       keeping it would leave a button that silently does nothing. Dismissing the dialog does
       not install anything, but the browser will fire beforeinstallprompt again later if it
       still wants to offer, and that is what puts the section back. */
    withdraw();

    try {
      const prompted = event.prompt();

      if (prompted && typeof prompted.catch === 'function') {
        prompted.catch(onError);
      }
    } catch (error) {
      onError(error);
    }
  });

  return { isOffering: () => section.hidden === false };
}
