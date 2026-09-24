import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

import { createIdFactory, randomUuidV4 } from '../../src/js/data/make-id.js';

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function cryptoWithoutRandomUuid() {
  return { getRandomValues: (bytes) => webcrypto.getRandomValues(bytes) };
}

test('uses randomUUID when the platform provides it', () => {
  let called = 0;
  const makeId = createIdFactory({
    getRandomValues: () => assert.fail('should not fall back'),
    randomUUID: () => {
      called++;
      return 'from-native';
    }
  });

  assert.equal(makeId(), 'from-native');
  assert.equal(called, 1);
});

test('falls back to getRandomValues when randomUUID is missing', () => {
  const makeId = createIdFactory(cryptoWithoutRandomUuid());
  assert.match(makeId(), UUID_V4_PATTERN);
});

test('the fallback produces a well formed v4 uuid', () => {
  const uuid = randomUuidV4(webcrypto);

  assert.match(uuid, UUID_V4_PATTERN);
  assert.equal(uuid.length, 36);
  assert.equal(uuid.split('-').length, 5);
});

test('the fallback sets the version and variant bits', () => {
  for (let index = 0; index < 50; index++) {
    const uuid = randomUuidV4(webcrypto);
    assert.equal(uuid[14], '4', 'version nibble should be 4');
    assert.ok('89ab'.includes(uuid[19]), 'variant nibble should be 8, 9, a or b');
  }
});

test('the fallback sets those bits even when every random byte is zero', () => {
  const allZeros = { getRandomValues: (bytes) => bytes.fill(0) };
  assert.equal(randomUuidV4(allZeros), '00000000-0000-4000-8000-000000000000');
});

test('the fallback sets those bits even when every random byte is 0xff', () => {
  const allOnes = { getRandomValues: (bytes) => bytes.fill(0xff) };
  assert.equal(randomUuidV4(allOnes), 'ffffffff-ffff-4fff-bfff-ffffffffffff');
});

test('the fallback does not repeat itself', () => {
  const makeId = createIdFactory(cryptoWithoutRandomUuid());
  const ids = new Set(Array.from({ length: 500 }, makeId));

  assert.equal(ids.size, 500);
});

test('rejects a crypto source that cannot produce random bytes', () => {
  for (const source of [null, undefined, {}, { randomUUID: () => 'x' }]) {
    assert.throws(() => createIdFactory(source), /getRandomValues is required/);
  }
});
