export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export const FULL_MAX_EDGE = 1600;
export const FULL_QUALITY = 0.82;

export const THUMB_MAX_EDGE = 320;
export const THUMB_QUALITY = 0.7;

export const OUTPUT_TYPE = 'image/jpeg';

/* JPEG has no alpha, so a transparent PNG would otherwise encode its transparent areas
   as black. */
export const FLATTEN_COLOUR = '#ffffff';

function megabytes(bytes) {
  return Math.round(bytes / (1024 * 1024));
}

/* Scales the longest edge down to maxEdge and never up: a small photo is left at its
   own size rather than being blown up and re-encoded. */
export function targetSize(width, height, maxEdge) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  const longest = Math.max(width, height);
  if (longest <= maxEdge) {
    return { width: Math.round(width), height: Math.round(height) };
  }

  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

/* Runs before any decoding, so an oversized or non-image file is rejected without
   spending memory on it. */
export function checkFile(file) {
  if (!file || typeof file !== 'object') {
    return { ok: false, reason: 'That is not a file' };
  }

  if (typeof file.type !== 'string' || !file.type.startsWith('image/')) {
    return { ok: false, reason: 'Not an image' };
  }

  if (!Number.isFinite(file.size) || file.size <= 0) {
    return { ok: false, reason: 'That file is empty' };
  }

  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, reason: 'Larger than ' + megabytes(MAX_FILE_BYTES) + 'MB' };
  }

  return { ok: true };
}
