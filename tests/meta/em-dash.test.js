import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/* Written as an escape rather than the character itself, so this file stays ASCII and cannot
   trip the rule it enforces if the exemption below is ever narrowed. */
const EM_DASH = '—';

const root = fileURLToPath(new URL('../../', import.meta.url));

/* Binary members of the precache list. Reading a png as text and searching it for a three
   byte sequence would fail on the picture rather than on anything anyone wrote. */
const BINARY = /\.(png|jpe?g|ico|woff2?)$/;

/* The committed manifest is the list of what ships; tests/pwa/precache.test.js is what keeps
   it honest against disk. */
function shippedFiles() {
  const manifest = {};
  // eslint-disable-next-line no-new-func
  new Function('self', readFileSync(join(root, 'precache-manifest.js'), 'utf8'))(manifest);

  return manifest.PRECACHE_FILES.map((entry) => entry.url).filter((url) => !BINARY.test(url));
}

/* sw.js and precache-manifest.js ship but are deliberately not in the precache list, so they
   have to be named here. Everything else a reader sees is a document. */
function publicFiles() {
  const docs = readdirSync(join(root, 'docs'))
    .filter((name) => name.endsWith('.md'))
    .map((name) => 'docs/' + name);

  return [...shippedFiles(), 'sw.js', 'precache-manifest.js', 'README.md', 'CHANGELOG.md', ...docs];
}

const files = publicFiles();

test('the scan covers the files it is supposed to', () => {
  /* A loader that quietly returned nothing would make every assertion below pass. */
  assert.ok(files.length > 50, 'only ' + files.length + ' files scanned');

  for (const expected of ['index.html', 'src/js/main.js', 'README.md', 'CHANGELOG.md', 'docs/export-format.md']) {
    assert.ok(files.includes(expected), expected + ' is not being scanned');
  }
});

test('no em dash appears in anything a reader sees', () => {
  /* House rule: em dashes are rewritten, not typed. A colon, a comma, a full stop or
     parentheses says the same thing and reads as something a person wrote. tests/ and
     CLAUDE.md are exempt and are deliberately absent from the list above. */
  const offenders = [];

  for (const file of files) {
    const text = readFileSync(join(root, file), 'utf8');

    text.split('\n').forEach((line, index) => {
      if (line.includes(EM_DASH)) offenders.push(file + ':' + (index + 1) + ': ' + line.trim());
    });
  }

  assert.deepEqual(offenders, [], 'rewrite these rather than swapping in a hyphen:\n' + offenders.join('\n'));
});
