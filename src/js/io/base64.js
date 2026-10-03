/* btoa and atob take one character per byte, and both exist in node and the browser, so no
   dependency and no Buffer. The work is chunked because String.fromCharCode is applied to the
   chunk as arguments, and a few hundred thousand of those overflow the call stack. 8k is well
   inside every engine's argument limit. */
const CHUNK_SIZE = 8192;

export function bytesToBase64(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? 0);
  const parts = [];

  for (let offset = 0; offset < view.length; offset += CHUNK_SIZE) {
    parts.push(String.fromCharCode(...view.subarray(offset, offset + CHUNK_SIZE)));
  }

  return btoa(parts.join(''));
}

/* Returns null rather than throwing on anything that is not clean base64, because every caller
   is reading a file someone else wrote and has to report the problem rather than crash. */
export function base64ToBytes(value) {
  if (typeof value !== 'string') {
    return null;
  }

  let binary;
  try {
    binary = atob(value);
  } catch {
    return null;
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

/* atob is lenient about some malformed input, so the length is checked separately: valid
   base64 is a multiple of four characters with at most two padding characters. */
export function isBase64(value) {
  return (
    typeof value === 'string' &&
    value.length % 4 === 0 &&
    /^[A-Za-z0-9+/]*={0,2}$/.test(value) &&
    base64ToBytes(value) !== null
  );
}

export function base64ByteLength(value) {
  const bytes = base64ToBytes(value);
  return bytes === null ? null : bytes.length;
}
