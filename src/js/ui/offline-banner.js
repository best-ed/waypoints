export const OFFLINE_MESSAGE =
  "You're offline. Your memories are here; place search and unvisited map areas need a connection.";

/* Says what still works before what does not, because the honest answer to "am I about to lose
   my memories" is no, and that is the first thing anyone wants to know.

   Takes its elements and its event target as arguments, so it never reaches for document and
   can be driven by fakes. */
export function createOfflineBanner({ banner, text, dismissButton, target, isOnline }) {
  let dismissed = false;

  function show() {
    /* Written on every show rather than once at startup. The text node carries role="status",
       and a live region only announces a change to its contents - toggling hidden on a region
       that already said this would announce nothing. */
    text.textContent = OFFLINE_MESSAGE;
    banner.hidden = false;
  }

  function hide() {
    banner.hidden = true;
    text.textContent = '';
  }

  function goOffline() {
    if (!dismissed) {
      show();
    }
  }

  /* Coming back online clears the dismissal as well as the banner: the next time the
     connection drops is new information, not the notice someone already waved away. */
  function goOnline() {
    dismissed = false;
    hide();
  }

  dismissButton.addEventListener('click', () => {
    dismissed = true;
    hide();
  });

  target.addEventListener('offline', goOffline);
  target.addEventListener('online', goOnline);

  /* A page loaded with no connection never fires the offline event - it was already offline
     before anything of ours was listening. */
  if (!isOnline()) {
    show();
  }

  return { isShowing: () => banner.hidden === false };
}
