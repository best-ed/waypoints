import { test } from 'node:test';
import assert from 'node:assert/strict';

import { warmTileCache } from '../../src/js/map/warm-tile-cache.js';

function fakeContainer(sources) {
  return {
    querySelectorAll(selector) {
      assert.equal(selector, 'img.leaflet-tile', 'reads rendered tiles, not layer internals');
      return sources.map((src) => ({ src }));
    }
  };
}

test('asks for every tile currently on screen', () => {
  const asked = [];
  const count = warmTileCache(fakeContainer(['https://a/1.png', 'https://a/2.png']), {
    fetchTile: (url) => asked.push(url)
  });

  assert.deepEqual(asked, ['https://a/1.png', 'https://a/2.png']);
  assert.equal(count, 2);
});

test('asks for each distinct tile once, however many img elements share it', () => {
  const asked = [];
  const count = warmTileCache(fakeContainer(['https://a/1.png', 'https://a/1.png']), {
    fetchTile: (url) => asked.push(url)
  });

  assert.deepEqual(asked, ['https://a/1.png']);
  assert.equal(count, 1);
});

test('skips a tile element with no source yet', () => {
  const asked = [];
  warmTileCache(fakeContainer(['', 'https://a/2.png']), { fetchTile: (url) => asked.push(url) });

  assert.deepEqual(asked, ['https://a/2.png']);
});

test('does nothing without a container', () => {
  assert.equal(warmTileCache(null, { fetchTile: () => assert.fail('must not fetch') }), 0);
  assert.equal(warmTileCache(undefined, { fetchTile: () => assert.fail('must not fetch') }), 0);
});

test('does nothing when no tiles are drawn', () => {
  assert.equal(warmTileCache(fakeContainer([]), { fetchTile: () => assert.fail('no') }), 0);
});

test('a tile that will not warm is swallowed rather than thrown', async () => {
  /* Warming is best effort: a failure leaves us exactly where we already were. */
  assert.doesNotThrow(() =>
    warmTileCache(fakeContainer(['https://a/1.png']), {
      fetchTile: () => Promise.reject(new Error('offline'))
    })
  );

  await new Promise((resolve) => setTimeout(resolve, 0));
});

test('a fetchTile that throws outright does not escape either', () => {
  assert.doesNotThrow(() =>
    warmTileCache(fakeContainer(['https://a/1.png']), {
      fetchTile: () => {
        throw new Error('blocked');
      }
    })
  );
});

test('one tile throwing does not stop the rest being warmed', () => {
  const asked = [];
  const count = warmTileCache(fakeContainer(['https://a/1.png', 'https://a/2.png', 'https://a/3.png']), {
    fetchTile: (url) => {
      if (url.endsWith('1.png')) throw new Error('blocked');
      asked.push(url);
    }
  });

  assert.deepEqual(asked, ['https://a/2.png', 'https://a/3.png']);
  assert.equal(count, 3);
});
