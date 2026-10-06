import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { readTokenBlock } from '../helpers/contrast.js';

const root = new URL('../../', import.meta.url);

const css = readFileSync(new URL('src/css/tokens.css', root), 'utf8');
const LIGHT = readTokenBlock(css, ':root {');
const DARK = readTokenBlock(css, ":root[data-theme='dark']");

const manifest = JSON.parse(readFileSync(new URL('manifest.webmanifest', root), 'utf8'));
const html = readFileSync(new URL('index.html', root), 'utf8');

test('the manifest identifies the app', () => {
  assert.equal(manifest.name, 'waypoints');
  assert.equal(manifest.short_name, 'waypoints');
  assert.equal(manifest.display, 'standalone');
});

test('start_url and scope are relative, so the app works from any path', () => {
  /* An absolute "/" would break the moment this is served from a project subdirectory, which
     is exactly what a static host hands out. */
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
});

/* The manifest and the theme-color metas are the other places a colour is written out in
   full, for the same reason as the icons: neither can read a custom property. Pinned to the
   tokens so they cannot drift. */
test('the manifest colours are the light tokens', () => {
  assert.equal(manifest.background_color, LIGHT['--color-bg']);
  assert.equal(manifest.theme_color, LIGHT['--color-surface']);
});

test('each theme-color meta matches the header surface of its own scheme', () => {
  const metas = [...html.matchAll(/<meta name="theme-color" media="([^"]+)" content="([^"]+)" \/>/g)].map(
    (match) => ({ media: match[1], content: match[2] })
  );

  assert.equal(metas.length, 2, 'both schemes are declared');
  assert.equal(metas.find((m) => m.media.includes('light')).content, LIGHT['--color-surface']);
  assert.equal(metas.find((m) => m.media.includes('dark')).content, DARK['--color-surface']);
});

test('the head links the manifest and both icon forms', () => {
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest" \/>/);
  assert.match(html, /<link rel="icon" href="icons\/icon\.svg" type="image\/svg\+xml" \/>/);
  assert.match(html, /<link rel="apple-touch-icon" href="icons\/apple-touch-icon-180\.png" \/>/);
});

test('every icon the manifest declares is actually on disk', () => {
  for (const icon of manifest.icons) {
    assert.ok(existsSync(new URL(icon.src, root)), icon.src + ' is missing');
  }
});

test('the manifest offers both an any and a maskable icon', () => {
  const purposes = manifest.icons.map((icon) => icon.purpose);

  assert.ok(purposes.includes('any'), 'no icon for the ordinary case');
  assert.ok(purposes.includes('maskable'), 'no maskable icon, so a launcher would letterbox it');
});

test('the apple-touch icon is the maskable artwork, not the rounded plate', () => {
  /* iOS applies its own mask, so a plate we rounded ourselves would show gaps in the corners. */
  assert.match(html, /apple-touch-icon-180\.png/);
  assert.ok(existsSync(new URL('icons/apple-touch-icon-180.png', root)));
});
