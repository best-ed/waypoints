/* The only browser-facing part of io/. One object URL, one revoke, in the same function, so
   there is no pool to leak: the anchor is clicked synchronously and the URL is released on the
   next task once the browser has taken the blob. */
export function downloadText(filename, text, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  /* Not appended to the document: a detached anchor still dispatches a click, and this way
     there is nothing to clean up if the click throws. */
  anchor.click();

  /* Revoking immediately cancels the download in some browsers, which read the blob after the
     click returns. A task later is enough. */
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
