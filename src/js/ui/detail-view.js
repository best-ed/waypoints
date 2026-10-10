/* One memory, in full, where the list was.

   Everything a memory holds used to be crammed into a 280px popup floating over a map that
   moves: the note in full, the tags, and Edit, Move and Delete side by side at 11px. This is
   the surface that content was always asking for. It takes the sidebar's place rather than
   opening over it, so the map it describes is still there beside it on a wide screen.

   The module owns the view and nothing else. It does not know what a memory is beyond the
   fields it renders, it does not touch the store, and it does not know anything about the
   URL: main.js wires the back request to the history rules, because closing is sometimes a
   history.back() and sometimes not. */

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

export function createDetailView({
  sectionElement,
  contentElement,
  backButton,
  previousButton,
  nextButton,
  bodyElement = document.body,
  onBack,
  onPrevious,
  onNext,
  /* Escape belongs to whatever is already using it. Placement and move mode both attach
     their own handler while they are active, and a move started from this view has to be
     revertable without the view disappearing from under it. */
  isBlocked = () => false
}) {
  let openId = null;

  function renderBody(memory) {
    const title = element('h2', 'detail-title', memory.title);
    title.id = 'detail-title';
    /* Focus lands here when the view opens, which is how a screen reader is told that the
       list it was in has been replaced and by what. */
    title.tabIndex = -1;

    contentElement.replaceChildren(title);

    return title;
  }

  /* aria-disabled, not disabled: the buttons stay in the tab order at the ends, so stepping
     to the last memory cannot drop focus off the button that was just pressed. They do
     nothing instead, which main.js enforces by passing null. */
  function setNeighbours({ previous, next }) {
    previousButton.setAttribute('aria-disabled', String(!previous));
    nextButton.setAttribute('aria-disabled', String(!next));
  }

  function render(memory) {
    openId = memory.id;
    return renderBody(memory);
  }

  function open(memory) {
    const title = render(memory);

    sectionElement.hidden = false;
    bodyElement.setAttribute('data-detail', '');

    /* After the view is on screen: focus() on something still display:none does nothing at
       all, and the failure is silent. */
    title.focus();
  }

  function close() {
    if (openId === null) {
      return null;
    }

    const closed = openId;
    openId = null;

    sectionElement.hidden = true;
    bodyElement.removeAttribute('data-detail');
    contentElement.replaceChildren();

    return closed;
  }

  backButton.addEventListener('click', () => onBack());
  previousButton.addEventListener('click', () => onPrevious());
  nextButton.addEventListener('click', () => onNext());

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || openId === null) {
      return;
    }

    const target = event.target;
    const typing =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target && target.isContentEditable);

    /* A dialog has its own Escape and the browser handles it; closing this underneath an
       open dialog would leave the dialog over a view that is no longer there. */
    if (typing || document.querySelector('dialog[open]') || isBlocked()) {
      return;
    }

    onBack();
  });

  return {
    open,
    close,
    render,
    setNeighbours,
    openId: () => openId,
    isOpen: () => openId !== null
  };
}
