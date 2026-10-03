/* Everything shown here comes out of a file someone else wrote: ids, titles and the reasons
   built from them. All of it goes in through textContent, like every other piece of untrusted
   text in this app. */
function listItem(text) {
  const item = document.createElement('li');
  item.textContent = text;
  return item;
}

function countItem(value, singular, plural) {
  return listItem(value + ' ' + (value === 1 ? singular : plural));
}

export function createImportDialog({
  dialog,
  summaryElement,
  countsElement,
  skippedElement,
  skippedSummaryElement,
  skippedListElement,
  progressElement,
  errorElement,
  cancelButton,
  confirmButton,
  onConfirm
}) {
  let currentPlan = null;
  let returnFocusTo = null;

  function reset() {
    progressElement.textContent = '';
    errorElement.textContent = '';
    errorElement.hidden = true;
    confirmButton.hidden = false;
    confirmButton.disabled = false;
    cancelButton.textContent = 'Cancel';
  }

  function renderSkipped(plan) {
    const entries = [];

    for (const entry of plan.skippedMemories) {
      entries.push(entry.id + ' - ' + entry.reason);
    }

    for (const entry of plan.skippedPhotos) {
      entries.push('photo ' + entry.id + ' - ' + entry.reason);
    }

    for (const entry of plan.droppedReferences) {
      entries.push(
        entry.id +
          ' - ' +
          (entry.photoIds.length === 1 ? 'a photo reference' : entry.photoIds.length + ' photo references') +
          ' dropped, because the photos are in neither the file nor this browser'
      );
    }

    skippedElement.hidden = entries.length === 0;

    if (entries.length === 0) {
      skippedListElement.replaceChildren();
      return;
    }

    skippedSummaryElement.textContent =
      entries.length === 1 ? '1 thing was skipped' : entries.length + ' things were skipped';
    skippedListElement.replaceChildren(...entries.map(listItem));
  }

  /* Nothing is written until the person confirms, so this is purely a description of what
     would happen. */
  function showPlan(plan, { returnFocus = null } = {}) {
    currentPlan = plan;
    returnFocusTo = returnFocus;
    reset();

    const { counts } = plan;
    const total = counts.added + counts.updated + counts.unchanged;

    summaryElement.textContent =
      total === 0
        ? 'That file has nothing in it that can be imported.'
        : 'That file holds ' + total + (total === 1 ? ' memory' : ' memories') + '.';

    countsElement.replaceChildren(
      countItem(counts.added, 'new memory', 'new memories'),
      countItem(counts.updated, 'memory to update', 'memories to update'),
      countItem(counts.unchanged, 'memory already up to date', 'memories already up to date'),
      countItem(counts.photosToWrite, 'photo to write', 'photos to write')
    );

    renderSkipped(plan);

    /* Nothing to apply means nothing to confirm. */
    confirmButton.hidden = counts.added === 0 && counts.updated === 0 && counts.photosToWrite === 0;

    dialog.showModal();
  }

  function setProgress(text) {
    progressElement.textContent = text;
  }

  function setBusy(busy) {
    confirmButton.disabled = busy;
    cancelButton.disabled = busy;
  }

  function showError(message) {
    errorElement.textContent = message;
    errorElement.hidden = false;
    progressElement.textContent = '';
    confirmButton.hidden = true;
    cancelButton.textContent = 'Close';
    cancelButton.disabled = false;
  }

  function showResult(result) {
    progressElement.textContent = '';
    summaryElement.textContent = 'Import finished.';

    countsElement.replaceChildren(
      countItem(result.added, 'memory added', 'memories added'),
      countItem(result.updated, 'memory updated', 'memories updated'),
      countItem(result.unchanged, 'memory left as it was', 'memories left as they were'),
      countItem(result.photos, 'photo written', 'photos written')
    );

    confirmButton.hidden = true;
    cancelButton.textContent = 'Close';
    cancelButton.disabled = false;
  }

  cancelButton.addEventListener('click', () => dialog.close());

  confirmButton.addEventListener('click', () => {
    if (currentPlan) {
      onConfirm(currentPlan);
    }
  });

  /* The single teardown path, as everywhere else: Escape, Cancel and a programmatic close all
     arrive here. */
  dialog.addEventListener('close', () => {
    currentPlan = null;
    reset();

    if (returnFocusTo) {
      returnFocusTo.focus();
      returnFocusTo = null;
    }
  });

  return { showPlan, setProgress, setBusy, showError, showResult, close: () => dialog.close() };
}
