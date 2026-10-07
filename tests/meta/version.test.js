import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { APP_VERSION } from '../../src/js/config.js';

const root = new URL('../../', import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));

test('the version in config.js matches package.json', () => {
  /* The browser cannot read package.json and there is no build step to write the version in,
     so it is stated twice. This is what keeps the two from drifting. */
  assert.equal(APP_VERSION, pkg.version);
});

test('the version is a plain three part version', () => {
  assert.match(APP_VERSION, /^\d+\.\d+\.\d+$/);
});

test('Settings has somewhere to show it', () => {
  const html = readFileSync(new URL('index.html', root), 'utf8');

  assert.match(html, /id="app-version"/);
  /* Inside the settings dialog, not loose in the page. */
  const dialog = html.slice(html.indexOf('id="settings-dialog"'), html.indexOf('</dialog>', html.indexOf('id="settings-dialog"')));
  assert.match(dialog, /id="app-version"/);
});

test('the element is empty in the markup, so the version has one source', () => {
  const html = readFileSync(new URL('index.html', root), 'utf8');

  assert.match(html, /<p id="app-version" class="app-version"><\/p>/);
  assert.doesNotMatch(html, /waypoints \d+\.\d+\.\d+/);
});
