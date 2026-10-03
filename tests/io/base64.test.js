import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  bytesToBase64,
  base64ToBytes,
  isBase64,
  base64ByteLength
} from '../../src/js/io/base64.js';

function sequence(length) {
  const bytes = new Uint8Array(length);
  for (let index = 0; index < length; index++) {
    bytes[index] = index % 256;
  }
  return bytes;
}

test('encodes a known value', () => {
  assert.equal(bytesToBase64(new Uint8Array([72, 101, 108, 108, 111])), 'SGVsbG8=');
});

test('decodes a known value', () => {
  assert.deepEqual([...base64ToBytes('SGVsbG8=')], [72, 101, 108, 108, 111]);
});

test('an empty array round trips', () => {
  assert.equal(bytesToBase64(new Uint8Array(0)), '');
  assert.deepEqual([...base64ToBytes('')], []);
});

test('every byte value round trips', () => {
  const bytes = new Uint8Array(256);
  for (let index = 0; index < 256; index++) {
    bytes[index] = index;
  }

  assert.deepEqual([...base64ToBytes(bytesToBase64(bytes))], [...bytes]);
});

test('each padding length round trips', () => {
  for (const length of [1, 2, 3, 4, 5, 6]) {
    const bytes = sequence(length);
    assert.deepEqual([...base64ToBytes(bytesToBase64(bytes))], [...bytes], length + ' bytes');
  }
});

/* The reason the encoder chunks at all: String.fromCharCode is applied with the chunk as
   arguments, and a few hundred thousand of those overflow the call stack. A photo blob is
   comfortably this big, so this is the case that matters. */
test('a large array round trips without overflowing the stack', () => {
  const bytes = sequence(2 * 1024 * 1024);
  const encoded = bytesToBase64(bytes);

  assert.equal(typeof encoded, 'string');
  assert.ok(encoded.length > 2_700_000, 'encoded length was ' + encoded.length);

  const decoded = base64ToBytes(encoded);
  assert.equal(decoded.length, bytes.length);

  /* Compared without building two huge arrays to deep-equal. */
  let identical = true;
  for (let index = 0; index < bytes.length; index++) {
    if (decoded[index] !== bytes[index]) {
      identical = false;
      break;
    }
  }
  assert.ok(identical, 'the decoded bytes differ from the original');
});

test('a length either side of the chunk boundary round trips', () => {
  for (const length of [8191, 8192, 8193, 16384, 16385]) {
    const bytes = sequence(length);
    const decoded = base64ToBytes(bytesToBase64(bytes));
    assert.equal(decoded.length, length, length + ' bytes');
    assert.equal(decoded[length - 1], bytes[length - 1], 'last byte at ' + length);
  }
});

test('accepts an ArrayBuffer as well as a view', () => {
  const bytes = sequence(10);
  assert.equal(bytesToBase64(bytes.buffer), bytesToBase64(bytes));
});

test('encodes nothing for a missing argument', () => {
  assert.equal(bytesToBase64(undefined), '');
  assert.equal(bytesToBase64(null), '');
});

/* Every caller is reading a file someone else wrote, so bad input has to be reportable rather
   than fatal. */
test('decoding junk returns null rather than throwing', () => {
  for (const value of ['not base64!', '====', 'a', '%%%%', null, undefined, 42, {}]) {
    assert.equal(base64ToBytes(value), null, JSON.stringify(value));
  }
});

test('recognises valid base64', () => {
  assert.equal(isBase64('SGVsbG8='), true);
  assert.equal(isBase64(''), true);
  assert.equal(isBase64(bytesToBase64(sequence(1000))), true);
});

test('rejects strings that are not base64', () => {
  for (const value of ['SGVsbG8', 'SGVsbG8==', 'a!b=', 'SGVs bG8=', null, 42]) {
    assert.equal(isBase64(value), false, JSON.stringify(value));
  }
});

test('reports the decoded byte length', () => {
  assert.equal(base64ByteLength('SGVsbG8='), 5);
  assert.equal(base64ByteLength(''), 0);
  assert.equal(base64ByteLength(bytesToBase64(sequence(4096))), 4096);
  assert.equal(base64ByteLength('nope!'), null);
});
