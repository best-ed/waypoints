/* One pool per surface that shows blobs - the form, the popup strip, the lightbox. Each
   surface revokes its whole pool in exactly one place when it tears down, so no caller
   has to remember to revoke an individual URL and none of them leak. */
export function createObjectUrlPool() {
  const urls = new Set();

  function create(blob) {
    const url = URL.createObjectURL(blob);
    urls.add(url);
    return url;
  }

  function revokeAll() {
    for (const url of urls) {
      URL.revokeObjectURL(url);
    }
    urls.clear();
  }

  return { create, revokeAll, size: () => urls.size };
}
