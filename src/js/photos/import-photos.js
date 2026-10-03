import { base64ToBytes } from '../io/base64.js';
import { FULL_MAX_EDGE, THUMB_MAX_EDGE } from './photo-rules.js';

/* Longest edge, which is what the pipeline caps. A file claiming anything larger has either
   been hand-edited or came from a build that wrote bigger images, and either way it is
   re-encoded rather than trusted. */
function exceedsLimits(width, height, thumbWidth, thumbHeight) {
  return (
    Math.max(width, height) > FULL_MAX_EDGE ||
    (thumbWidth > 0 && Math.max(thumbWidth, thumbHeight) > THUMB_MAX_EDGE)
  );
}

function toBlob(base64, mime) {
  const bytes = base64ToBytes(base64);
  return bytes === null ? null : new Blob([bytes], { type: mime });
}

/* Writes the photos a plan asked for, and undoes itself if anything goes wrong.

   decode and reprocess are injected: decode is createImageBitmap, which is the only honest way
   to tell an actual image from a base64 blob that merely claims a mime type, and reprocess is
   the ordinary photo pipeline. Neither exists under node, so both come in as arguments and the
   logic here stays testable.

   Rollback is the caller's safety net as well as this one's: every id written is recorded, so a
   failure half way through removes exactly what this call put there and nothing else. */
export async function writeImportedPhotos(
  photos,
  { repository, decode, reprocess, onProgress = () => {}, now = () => new Date() }
) {
  const queue = Array.isArray(photos) ? photos : [];
  const written = [];
  const skipped = [];

  async function rollback() {
    if (written.length > 0) {
      await repository.removeMany(written).catch(() => {
        /* The original failure is what the caller needs to hear about; a rollback that cannot
           finish must not replace it with its own error. */
      });
    }
  }

  try {
    for (let index = 0; index < queue.length; index++) {
      const photo = queue[index];
      onProgress(index + 1, queue.length);

      const blob = toBlob(photo.data, photo.mime);
      if (!blob || blob.size === 0) {
        skipped.push({ id: photo.id, reason: 'the image data could not be decoded' });
        continue;
      }

      /* The decode check proper. A JSON file can claim image/jpeg over any bytes at all, and
         only an actual decode settles it. */
      let bitmap = null;
      try {
        bitmap = await decode(blob);
      } catch {
        skipped.push({ id: photo.id, reason: 'the image could not be decoded' });
        continue;
      }

      const thumbBlob = photo.thumb ? toBlob(photo.thumb, photo.mime) : null;
      let thumbBitmap = null;

      if (thumbBlob) {
        try {
          thumbBitmap = await decode(thumbBlob);
        } catch {
          /* A broken thumbnail is not worth losing the photo over: re-processing makes a new
             one from the full image. */
          thumbBitmap = null;
        }
      }

      const oversized =
        exceedsLimits(
          bitmap.width,
          bitmap.height,
          thumbBitmap ? thumbBitmap.width : 0,
          thumbBitmap ? thumbBitmap.height : 0
        ) || !thumbBlob || !thumbBitmap;

      let record;

      if (oversized) {
        /* Back through the same pipeline a freshly picked file goes through, so an imported
           photo ends up stored exactly like one added by hand. The id is kept, because the
           memories already refer to it. */
        const processed = await reprocess(blob, { makeId: () => photo.id, now });
        record = { ...processed, id: photo.id };
      } else {
        record = {
          id: photo.id,
          blob,
          thumb: thumbBlob,
          width: bitmap.width,
          height: bitmap.height,
          createdAt: photo.createdAt || now().toISOString()
        };
      }

      await repository.put(record);
      written.push(record.id);
    }
  } catch (error) {
    await rollback();
    throw error;
  }

  return { written, skipped };
}
