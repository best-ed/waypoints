/* What the sidebar shows when nothing has ever been saved.

   A search box, a filter panel, a timeline and a journey control are all answers to questions
   nobody with an empty library is asking, and the first run used to show every one of them:
   "None yet", a Journey button that could not be pressed, and the sentence "A journey needs at
   least two memories in view" - two of the four things on screen being about a feature that
   needs two memories, shown to someone who has none.

   This is about the library being empty, not about a filter excluding everything. Those are
   different states with different answers, and the one below is the first. */

export function createEmptyLibrary({
  controlsElement,
  welcomeElement,
  addButton,
  importButton,
  onAdd,
  onImport
}) {
  addButton.addEventListener('click', () => onAdd());
  importButton.addEventListener('click', () => onImport());

  /* Takes the total, never the filtered count: a search matching nothing is not a first run,
     and replacing the search box with a welcome at the moment someone mistypes would be a
     good way to lose the thing they were looking for. */
  function render(total) {
    const empty = total === 0;

    controlsElement.hidden = empty;
    welcomeElement.hidden = !empty;

    return empty;
  }

  return { render };
}
