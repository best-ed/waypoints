import { createIcon } from './icons.js';
import { MAX_PHOTOS } from '../data/schema.js';
import { createObjectUrlPool } from './object-urls.js';

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

/* Holds the photos a form session is working with. Existing ones arrive as ids with a
   thumbnail already in the database; pending ones are processed but unwritten. Nothing
   here touches the database - the caller applies the result on save. */
export function createPhotoPicker({ gridElement, inputElement, countElement, errorElement, processFiles }) {
  const urls = createObjectUrlPool();
  let entries = [];
  let removedExistingIds = [];

  function atCap() {
    return entries.length >= MAX_PHOTOS;
  }

  function showErrors(messages) {
    errorElement.replaceChildren();
    errorElement.hidden = messages.length === 0;

    for (const message of messages) {
      errorElement.append(element('p', 'photo-error', message));
    }
  }

  function removeAt(index) {
    const [removed] = entries.splice(index, 1);
    if (removed && removed.existing) {
      removedExistingIds.push(removed.id);
    }
    render();
  }

  function buildTile(entry, index) {
    const item = element('li', 'photo-tile');

    const image = element('img', 'photo-thumb');
    image.src = urls.create(entry.thumb);
    /* Decorative here: the tile sits beside its own remove button, which names it. */
    image.alt = '';
    item.append(image);

    const remove = element('button', 'button button-sm icon-only photo-remove');
    remove.type = 'button';
    remove.append(createIcon('close', { size: 14 }));
    /* Icon only, so the name has to come from here. The pill that used to say "Remove"
       covered the photo it was about to remove. */
    remove.setAttribute('aria-label', 'Remove photo ' + (index + 1));
    remove.addEventListener('click', () => removeAt(index));
    item.append(remove);

    return item;
  }

  /* Rebuilt whole on every change, which means every previous object URL is dead. The
     pool is revoked first so the tiles that follow are the only ones holding URLs. */
  function render() {
    urls.revokeAll();
    gridElement.replaceChildren(...entries.map(buildTile));

    countElement.textContent = entries.length + ' of ' + MAX_PHOTOS;
    inputElement.disabled = atCap();
  }

  async function handleFiles(fileList) {
    const files = [...fileList];
    inputElement.value = '';

    if (files.length === 0) {
      return;
    }

    const room = MAX_PHOTOS - entries.length;
    const accepted = files.slice(0, room);
    const rejectedForSpace = files.slice(room);

    const { records, errors } = await processFiles(accepted);

    for (const record of records) {
      entries.push({ id: record.id, thumb: record.thumb, record, existing: false });
    }

    const messages = [...errors];
    for (const file of rejectedForSpace) {
      messages.push(file.name + ': only ' + MAX_PHOTOS + ' photos per memory');
    }

    showErrors(messages);
    render();
  }

  inputElement.addEventListener('change', (event) => handleFiles(event.target.files));

  function reset(existingPhotos = []) {
    entries = existingPhotos.map((photo) => ({
      id: photo.id,
      thumb: photo.thumb,
      record: null,
      existing: true
    }));
    removedExistingIds = [];
    showErrors([]);
    render();
  }

  /* Called when the dialog closes on any path, so a cancelled session leaves no URLs
     behind and the next session starts clean. */
  function dispose() {
    urls.revokeAll();
    gridElement.replaceChildren();
    entries = [];
    removedExistingIds = [];
    showErrors([]);
  }

  return {
    reset,
    dispose,
    getPhotoIds: () => entries.map((entry) => entry.id),
    getPendingRecords: () => entries.filter((entry) => !entry.existing).map((entry) => entry.record),
    getRemovedExistingIds: () => [...removedExistingIds],
    count: () => entries.length
  };
}
