import { createObjectUrlPool } from './object-urls.js';

/* One owner for every object URL on the map. Leaflet keeps a single popup open at a time, so
   opening the next one releases the previous one's URL and closing the last releases it.
   Nothing else revokes a popup thumbnail.

   The popup shows one cover now rather than a strip of every photo, so this reads one record
   rather than all six: a preview of a memory with six photos used to pull six blobs out of
   IndexedDB to draw six 56px squares. The full set is read when the detail view opens, which
   is where the photos are actually looked at. */
export function createPopupPhotos({ loadPhoto }) {
  const urls = createObjectUrlPool();

  function release() {
    urls.revokeAll();
  }

  async function fill(cover, memory) {
    const record = await loadPhoto(memory.photoIds[0]);

    /* The popup may already have closed, or been rebuilt for another marker, while the blob
       was being read. */
    if (!record || !cover.isConnected) {
      return;
    }

    const image = cover.querySelector('.popup-cover-image');

    if (!image) {
      return;
    }

    image.src = urls.create(record.thumb);
    image.hidden = false;
  }

  return { fill, release };
}
