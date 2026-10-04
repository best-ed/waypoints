const BYTES_PER_MB = 1024 * 1024;

function megabytes(bytes) {
  return (bytes / BYTES_PER_MB).toFixed(1) + 'MB';
}

/* Both of these are missing in an insecure context, and estimate() can also reject outright.
   Either way the line is hidden rather than showing a guess or an error. */
async function readEstimate() {
  if (!navigator.storage || typeof navigator.storage.estimate !== 'function') {
    return null;
  }

  try {
    const { usage, quota } = await navigator.storage.estimate();
    return Number.isFinite(usage) && Number.isFinite(quota) ? { usage, quota } : null;
  } catch {
    return null;
  }
}

async function readPersisted() {
  if (!navigator.storage || typeof navigator.storage.persisted !== 'function') {
    return null;
  }

  try {
    return await navigator.storage.persisted();
  } catch {
    return null;
  }
}

export function createSettingsDialog({
  dialog,
  openButton,
  closeButton,
  toggleElement,
  themeElement,
  usageElement,
  persistedElement,
  settings,
  onThemeChange = () => {},
  onOpen = () => {}
}) {
  let returnFocusTo = null;

  async function refreshStorage() {
    const estimate = await readEstimate();

    if (estimate) {
      const percent = estimate.quota > 0 ? Math.round((estimate.usage / estimate.quota) * 100) : 0;
      usageElement.textContent =
        'Using ' + megabytes(estimate.usage) + ' of ' + megabytes(estimate.quota) + ' (' + percent + '%)';
      usageElement.hidden = false;
    } else {
      usageElement.hidden = true;
    }

    const persisted = await readPersisted();

    if (persisted === null) {
      persistedElement.hidden = true;
    } else {
      persistedElement.textContent = persisted
        ? 'Storage is persisted, so the browser will not clear it to reclaim space.'
        : 'Storage is not persisted, so the browser may clear it to reclaim space.';
      persistedElement.hidden = false;
    }
  }

  function open() {
    returnFocusTo = openButton;
    toggleElement.checked = settings.get().suggestPlaceNames;
    themeElement.value = settings.get().theme;
    onOpen();
    dialog.showModal();

    /* Not awaited: the dialog opens immediately and the storage lines fill in when the
       estimate comes back. */
    refreshStorage();
  }

  openButton.addEventListener('click', () => open());
  closeButton.addEventListener('click', () => dialog.close());

  toggleElement.addEventListener('change', () => {
    settings.set({ suggestPlaceNames: toggleElement.checked });
  });

  themeElement.addEventListener('change', () => {
    settings.set({ theme: themeElement.value });
    onThemeChange(settings.get().theme);
  });

  /* The single teardown path, as with every other dialog here: Escape, the close button and a
     programmatic close all arrive as this one event. */
  dialog.addEventListener('close', () => {
    if (returnFocusTo) {
      returnFocusTo.focus();
      returnFocusTo = null;
    }
  });

  return { open, close: () => dialog.close(), refreshStorage };
}
