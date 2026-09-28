import {
  FLATTEN_COLOUR,
  FULL_MAX_EDGE,
  FULL_QUALITY,
  OUTPUT_TYPE,
  THUMB_MAX_EDGE,
  THUMB_QUALITY,
  targetSize
} from './photo-rules.js';

export class PhotoDecodeError extends Error {
  constructor(cause, message = 'That image could not be read') {
    super(message);
    this.name = 'PhotoDecodeError';
    this.cause = cause;
  }
}

function createCanvas(width, height) {
  if (typeof OffscreenCanvas === 'function') {
    return new OffscreenCanvas(width, height);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function encode(canvas, quality) {
  if (typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob({ type: OUTPUT_TYPE, quality });
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The image could not be encoded'))),
      OUTPUT_TYPE,
      quality
    );
  });
}

/* JPEG cannot carry alpha, so the canvas is painted white first. Without this a
   transparent PNG comes out with black where it used to be see-through. */
function drawOnto(bitmap, { width, height }) {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');

  context.fillStyle = FLATTEN_COLOUR;
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);

  return canvas;
}

async function renderTo(bitmap, maxEdge, quality) {
  const size = targetSize(bitmap.width, bitmap.height, maxEdge);
  if (!size) {
    throw new PhotoDecodeError(null, 'That image has no usable size');
  }

  return { blob: await encode(drawOnto(bitmap, size), quality), size };
}

/* imageOrientation "from-image" applies the EXIF rotation during decode, so a portrait
   phone photo does not come out on its side. */
async function decode(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (error) {
    throw new PhotoDecodeError(error);
  }
}

export async function processImage(file, { makeId, now }) {
  const bitmap = await decode(file);

  try {
    const full = await renderTo(bitmap, FULL_MAX_EDGE, FULL_QUALITY);
    const thumb = await renderTo(bitmap, THUMB_MAX_EDGE, THUMB_QUALITY);

    return {
      id: makeId(),
      blob: full.blob,
      thumb: thumb.blob,
      width: full.size.width,
      height: full.size.height,
      createdAt: now().toISOString()
    };
  } finally {
    /* Frees the decoded pixels straight away rather than waiting for a collection that
       may not come until several more photos have been decoded. */
    bitmap.close();
  }
}
