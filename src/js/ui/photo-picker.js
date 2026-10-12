import { createIcon } from './icons.js';
import { MAX_PHOTOS } from '../data/schema.js';
import { createObjectUrlPool } from './object-urls.js';
import { movePhoto } from './move-photo.js';

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
/* What a tile drag carries. Any string would do; this one says what it is in a drag inspector
   and never collides with a file drag, which carries no data at all. */
const REORDER_TYPE = 'application/x-waypoints-photo';

export function createPhotoPicker({
  gridElement,
  inputElement,
  countElement,
  errorElement,
  /* Where a move is announced. Polite, because a reorder is a result rather than an alert. */
  statusElement = null,
  /* The grid and the add button together, so a photo can be dropped anywhere it obviously
     belongs rather than onto a strip beside it. */
  dropElement = null,
  processFiles
}) {
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

  function announce(message) {
    if (statusElement) {
      statusElement.textContent = message;
    }
  }

  /* The order is the whole of it: the first photo is the cover, and there is no cover field
     anywhere. A field would have to be validated, migrated and kept honest against a list it
     could contradict, for a fact the list already carries. */
  function moveTo(from, to, action) {
    const target = Math.max(0, Math.min(to, entries.length - 1));

    if (target === from) {
      return;
    }

    entries = movePhoto(entries, from, target);

    announce(
      target === 0
        ? 'Photo ' + (from + 1) + ' is now the cover'
        : 'Photo ' + (from + 1) + ' moved to position ' + (target + 1)
    );

    render();

    /* The grid was rebuilt, so the button that was pressed is a different node now. Focus
       follows the photo rather than staying at the position it left. */
    if (action) {
      const tile = gridElement.children[target];
      tile?.querySelector('[data-move="' + action + '"]')?.focus();
    }
  }

  function moveButton(action, label, index, target, disabled) {
    const button = element('button', 'button button-sm icon-only photo-move');
    button.type = 'button';
    button.dataset.move = action;
    button.setAttribute('aria-label', label);
    /* aria-disabled rather than disabled, as everywhere else: a disabled button leaves the tab
       order, which would drop focus the moment a photo reaches an end. */
    button.setAttribute('aria-disabled', String(disabled));
    button.append(createIcon({ earlier: 'previous', later: 'next', cover: 'photo' }[action], { size: 14 }));
    button.addEventListener('click', () => {
      if (!disabled) {
        moveTo(index, target, action);
      }
    });
    return button;
  }

  function buildTile(entry, index) {
    const item = element('li', 'photo-tile');
    const position = index + 1;

    /* Native drag and drop, so there is nothing to animate and nothing for reduced motion to
       turn off: the picture is picked up by the browser and the list is in its new order the
       moment it is let go. */
    item.draggable = true;
    /* Position, for a drop to read, and identity, which survives a reorder. The grid is
       rebuilt on every change and every object URL with it, so the src of the image in a tile
       says nothing about which photo it is. */
    item.dataset.index = String(index);
    item.dataset.photoId = entry.id;

    const image = element('img', 'photo-thumb');
    image.src = urls.create(entry.thumb);
    /* Decorative here: the tile carries its own named buttons. */
    image.alt = '';
    item.append(image);

    if (index === 0) {
      /* Said on the tile rather than left to be inferred from position. Which photo travels
         with the memory everywhere else is worth one word. */
      item.append(element('span', 'photo-cover-badge', 'Cover'));
    }

    const remove = element('button', 'button button-sm icon-only photo-remove');
    remove.type = 'button';
    remove.append(createIcon('close', { size: 14 }));
    /* Icon only, so the name has to come from here. The pill that used to say "Remove"
       covered the photo it was about to remove. */
    remove.setAttribute('aria-label', 'Remove photo ' + position);
    remove.addEventListener('click', () => removeAt(index));
    item.append(remove);

    if (entries.length > 1) {
      const actions = element('div', 'photo-actions');
      actions.append(
        moveButton('earlier', 'Move photo ' + position + ' earlier', index, index - 1, index === 0),
        moveButton('later', 'Move photo ' + position + ' later', index, index + 1, index === entries.length - 1),
        moveButton('cover', 'Make photo ' + position + ' the cover', index, 0, index === 0)
      );
      item.append(actions);
    }

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

  /* Reordering by pointer. Delegated from the grid because the tiles are rebuilt on every
     change, so listeners on them would have to be re-attached every time.

     Native drag and drop rather than pointer events and a transform: the browser does the
     picking up, there is nothing of ours to animate, and so there is nothing for reduced
     motion to turn off. */
  let draggingFrom = null;

  gridElement.addEventListener('dragstart', (event) => {
    const tile = event.target.closest('.photo-tile');

    if (!tile) {
      return;
    }

    draggingFrom = Number(tile.dataset.index);
    event.dataTransfer.effectAllowed = 'move';
    /* Something has to be set or Safari refuses to start the drag at all. */
    event.dataTransfer.setData(REORDER_TYPE, String(draggingFrom));
    tile.classList.add('is-dragging');
  });

  gridElement.addEventListener('dragend', () => {
    draggingFrom = null;
    for (const tile of gridElement.children) {
      tile.classList.remove('is-dragging', 'is-drop-target');
    }
  });

  gridElement.addEventListener('dragover', (event) => {
    if (draggingFrom === null) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';

    const tile = event.target.closest('.photo-tile');
    for (const other of gridElement.children) {
      other.classList.toggle('is-drop-target', other === tile && Number(other.dataset.index) !== draggingFrom);
    }
  });

  gridElement.addEventListener('drop', (event) => {
    const tile = event.target.closest('.photo-tile');

    if (draggingFrom === null || !tile) {
      return;
    }

    /* Stopped here as well as prevented: the drop zone around this grid reads files off a
       drop, and a tile carries none. */
    event.preventDefault();
    event.stopPropagation();

    const to = Number(tile.dataset.index);
    const from = draggingFrom;
    draggingFrom = null;

    moveTo(from, to, null);
  });

  /* Dropping and pasting both end up in handleFiles, which is where the cap, the per-file
     checks and the error reporting already live. Nothing about a file changes because of how
     it arrived. */
  if (dropElement) {
    let depth = 0;

    const setDragging = (dragging) => dropElement.classList.toggle('is-dragging', dragging);

    /* A tile being dragged across this zone is a reorder, not an import. Without this the
       whole area lights up as a file target while a photo is being moved three pixels. */
    const carriesFiles = (event) => [...(event.dataTransfer?.types ?? [])].includes('Files');

    /* Counted rather than toggled: dragenter and dragleave fire for every child the pointer
       crosses, so a single boolean flickers off the moment the pointer moves from the zone
       onto a photo inside it. */
    dropElement.addEventListener('dragenter', (event) => {
      if (!carriesFiles(event)) {
        return;
      }
      event.preventDefault();
      depth += 1;
      setDragging(true);
    });

    /* Without preventDefault on dragover the browser refuses the drop and opens the file
       instead, which navigates away from a half-written memory. */
    dropElement.addEventListener('dragover', (event) => {
      if (!carriesFiles(event)) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    });

    dropElement.addEventListener('dragleave', () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) {
        setDragging(false);
      }
    });

    dropElement.addEventListener('drop', (event) => {
      event.preventDefault();
      depth = 0;
      setDragging(false);

      const files = event.dataTransfer?.files;
      if (files && files.length > 0) {
        handleFiles(files).catch((error) => showErrors([String(error)]));
      }
    });
  }

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
    /* For the paste path, which the form owns because the clipboard belongs to the dialog
       rather than to this corner of it. */
    addFiles: (files) => handleFiles(files),
    getPhotoIds: () => entries.map((entry) => entry.id),
    getPendingRecords: () => entries.filter((entry) => !entry.existing).map((entry) => entry.record),
    getRemovedExistingIds: () => [...removedExistingIds],
    count: () => entries.length
  };
}
