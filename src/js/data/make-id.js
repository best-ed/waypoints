const UUID_BYTE_LENGTH = 16;
const VERSION_BYTE = 6;
const VARIANT_BYTE = 8;

function toHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/* crypto.randomUUID only exists in a secure context, so it is missing when the app is
   opened over plain http on a LAN address - which is exactly how phone testing works. */
export function randomUuidV4(cryptoApi) {
  const bytes = new Uint8Array(UUID_BYTE_LENGTH);
  cryptoApi.getRandomValues(bytes);

  bytes[VERSION_BYTE] = (bytes[VERSION_BYTE] & 0x0f) | 0x40;
  bytes[VARIANT_BYTE] = (bytes[VARIANT_BYTE] & 0x3f) | 0x80;

  const hex = toHex(bytes);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20)
  ].join('-');
}

export function createIdFactory(cryptoApi) {
  if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function') {
    throw new Error('A crypto source with getRandomValues is required');
  }

  if (typeof cryptoApi.randomUUID === 'function') {
    return () => cryptoApi.randomUUID();
  }

  return () => randomUuidV4(cryptoApi);
}
