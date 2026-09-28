import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  checkFile,
  targetSize,
  FULL_MAX_EDGE,
  MAX_FILE_BYTES,
  THUMB_MAX_EDGE
} from '../../src/js/photos/photo-rules.js';

function fakeFile({ type = 'image/jpeg', size = 1024 } = {}) {
  return { type, size, name: 'photo.jpg' };
}

function aspectRatio({ width, height }) {
  return width / height;
}

test('scales a landscape image down by its longest edge', () => {
  const result = targetSize(4032, 3024, FULL_MAX_EDGE);

  assert.equal(result.width, 1600);
  assert.equal(result.height, 1200);
});

test('scales a portrait image down by its longest edge', () => {
  const result = targetSize(3024, 4032, FULL_MAX_EDGE);

  assert.equal(result.height, 1600);
  assert.equal(result.width, 1200);
});

test('keeps the aspect ratio within rounding', () => {
  for (const [width, height] of [[4032, 3024], [3024, 4032], [1920, 1080], [1000, 999]]) {
    const result = targetSize(width, height, FULL_MAX_EDGE);
    assert.ok(
      Math.abs(aspectRatio(result) - width / height) < 0.01,
      width + 'x' + height + ' kept its shape'
    );
  }
});

/* The rule that stops a small photo being blown up and re-encoded for no reason. */
test('never upscales', () => {
  assert.deepEqual(targetSize(800, 600, FULL_MAX_EDGE), { width: 800, height: 600 });
  assert.deepEqual(targetSize(100, 100, FULL_MAX_EDGE), { width: 100, height: 100 });
  assert.deepEqual(targetSize(1, 1, FULL_MAX_EDGE), { width: 1, height: 1 });
});

test('leaves an image exactly at the limit alone', () => {
  assert.deepEqual(targetSize(1600, 1200, FULL_MAX_EDGE), { width: 1600, height: 1200 });
  assert.deepEqual(targetSize(1200, 1600, FULL_MAX_EDGE), { width: 1200, height: 1600 });
});

test('scales a square image on both edges', () => {
  assert.deepEqual(targetSize(3000, 3000, FULL_MAX_EDGE), { width: 1600, height: 1600 });
});

test('uses the thumbnail limit when asked for one', () => {
  const result = targetSize(4032, 3024, THUMB_MAX_EDGE);

  assert.equal(result.width, 320);
  assert.equal(result.height, 240);
});

test('never rounds an extreme aspect ratio down to zero', () => {
  const result = targetSize(10000, 3, FULL_MAX_EDGE);

  assert.equal(result.width, 1600);
  assert.ok(result.height >= 1, 'height stays at least one pixel');
});

test('returns null for sizes that are not usable', () => {
  for (const [width, height] of [[0, 100], [100, 0], [-5, 10], [NaN, 10], [Infinity, 10]]) {
    assert.equal(targetSize(width, height, FULL_MAX_EDGE), null);
  }
});

test('accepts an ordinary image file', () => {
  assert.deepEqual(checkFile(fakeFile()), { ok: true });
  assert.deepEqual(checkFile(fakeFile({ type: 'image/png' })), { ok: true });
  assert.deepEqual(checkFile(fakeFile({ type: 'image/heic' })), { ok: true });
});

test('rejects a file that is not an image', () => {
  for (const type of ['text/plain', 'application/pdf', 'video/mp4', '']) {
    const result = checkFile(fakeFile({ type }));
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'Not an image');
  }
});

/* A text file renamed to .jpg keeps its real type, so the check catches it here rather
   than letting the decoder fail later. */
test('rejects a file with a missing type', () => {
  assert.equal(checkFile({ size: 100 }).ok, false);
  assert.equal(checkFile({ type: null, size: 100 }).ok, false);
});

test('rejects a file over the size limit before decoding', () => {
  const result = checkFile(fakeFile({ size: MAX_FILE_BYTES + 1 }));

  assert.equal(result.ok, false);
  assert.match(result.reason, /Larger than 25MB/);
});

test('accepts a file exactly at the size limit', () => {
  assert.deepEqual(checkFile(fakeFile({ size: MAX_FILE_BYTES })), { ok: true });
});

test('rejects an empty file', () => {
  const result = checkFile(fakeFile({ size: 0 }));

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'That file is empty');
});

test('rejects something that is not a file at all', () => {
  for (const value of [null, undefined, 'photo.jpg', 42]) {
    assert.equal(checkFile(value).ok, false);
  }
});
