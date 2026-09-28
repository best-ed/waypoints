import { createObjectUrlPool } from './object-urls.js';

function thumbnailAlt(index, total, title) {
  return 'Photo ' + (index + 1) + ' of ' + total + ', ' + title;
}

/* One owner for every thumbnail URL on the map. Leaflet keeps a single popup open at a
   time, so opening the next one releases the previous one's URLs and closing the last
   releases them all. Nothing else revokes a popup thumbnail. */
export function createPopupPhotos({ loadPhotos, onOpenLightbox }) {
  const urls = createObjectUrlPool();

  function release() {
    urls.revokeAll();
  }

  async function fill(strip, memory) {
    const records = await loadPhotos(memory.photoIds);

    /* The popup may already have closed while the blobs were being read. */
    if (!strip.isConnected) {
      return;
    }

    strip.replaceChildren();

    records.forEach((record, index) => {
      const item = document.createElement('li');
      item.className = 'popup-photo';

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'popup-photo-button';

      const image = document.createElement('img');
      image.src = urls.create(record.thumb);
      image.alt = thumbnailAlt(index, records.length, memory.title);
      image.className = 'popup-photo-thumb';

      button.append(image);
      button.addEventListener('click', () => onOpenLightbox(records, index, memory, button));

      item.append(button);
      strip.append(item);
    });
  }

  return { fill, release };
}
