import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createThumbnailOwner } from '../../src/js/ui/thumbnail-owner.js';

/* A database that answers when told to, so the concurrency limit can be observed rather than
   raced against. */
function fakeBackend() {
  const waiting = new Map();
  let started = 0;
  let peakConcurrent = 0;
  let open = 0;

  const backend = {
    started: () => started,
    peakConcurrent: () => peakConcurrent,
    pending: () => [...waiting.keys()],
    load(id) {
      started += 1;
      open += 1;
      if (open > peakConcurrent) peakConcurrent = open;

      return new Promise((resolve) => {
        waiting.set(id, (value) => {
          open -= 1;
          waiting.delete(id);
          resolve(value);
        });
      });
    },
    settle(id, value = { blob: id }) {
      const resolve = waiting.get(id);
      assert.ok(resolve, 'nothing was waiting for ' + id);
      resolve(value);
    },
    settleAll(value) {
      for (const id of [...waiting.keys()]) {
        backend.settle(id, value === undefined ? { blob: id } : value);
      }
    }
  };

  return backend;
}

function urlApi() {
  let made = 0;
  const alive = new Set();

  return {
    create: (blob) => {
      made += 1;
      const url = 'blob:' + made + ':' + (blob?.blob ?? '');
      alive.add(url);
      return url;
    },
    revoke: (url) => alive.delete(url),
    alive: () => alive.size,
    made: () => made
  };
}

const setup = (options = {}) => {
  const backend = fakeBackend();
  const urls = urlApi();
  const owner = createThumbnailOwner({
    loadThumb: (id) => backend.load(id),
    createObjectURL: urls.create,
    revokeObjectURL: urls.revoke,
    ...options
  });
  return { backend, urls, owner };
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test('a request reads once and yields a url', async () => {
  const { backend, urls, owner } = setup();

  const pending = owner.request('a');
  backend.settle('a');

  assert.equal(await pending, 'blob:1:a');
  assert.equal(urls.alive(), 1);
  assert.equal(owner.liveCount(), 1);
});

test('asking again for something already live does not read again', async () => {
  const { backend, owner } = setup();

  const first = owner.request('a');
  backend.settle('a');
  await first;

  const again = await owner.request('a');

  assert.equal(again, 'blob:1:a');
  assert.equal(backend.started(), 1, 'it read the database twice');
});

test('two requests for the same id while in flight share one read', async () => {
  const { backend, owner } = setup();

  const first = owner.request('a');
  const second = owner.request('a');
  backend.settle('a');

  assert.equal(await first, await second);
  assert.equal(backend.started(), 1);
});

test('no more than maxConcurrent reads are in flight', async () => {
  const { backend, owner } = setup({ maxConcurrent: 3 });

  for (let i = 0; i < 20; i += 1) owner.request('m' + i);
  await tick();

  assert.equal(backend.pending().length, 3);
  assert.equal(backend.peakConcurrent(), 3);
});

test('the queue drains as reads finish', async () => {
  const { backend, owner } = setup({ maxConcurrent: 2 });

  for (let i = 0; i < 6; i += 1) owner.request('m' + i);
  await tick();
  assert.equal(backend.pending().length, 2);

  backend.settleAll();
  await tick();
  assert.equal(backend.pending().length, 2, 'the next pair did not start');
  assert.equal(backend.peakConcurrent(), 2);
});

test('releasing revokes the url', async () => {
  const { backend, urls, owner } = setup();

  const pending = owner.request('a');
  backend.settle('a');
  await pending;

  assert.equal(owner.release('a'), true);
  assert.equal(urls.alive(), 0);
  assert.equal(owner.liveCount(), 0);
});

test('releasing while the read is in flight never creates a url', async () => {
  /* The scroll case: a row enters, the read starts, the row leaves before it finishes.
     Without this the url is created with nothing left to revoke it. */
  const { backend, urls, owner } = setup();

  const pending = owner.request('a');
  owner.release('a');
  backend.settle('a');

  assert.equal(await pending, null);
  assert.equal(urls.made(), 0);
  assert.equal(urls.alive(), 0);
});

test('live urls never exceed the cap', async () => {
  const { backend, urls, owner } = setup({ maxLive: 5, maxConcurrent: 50 });

  for (let i = 0; i < 40; i += 1) owner.request('m' + i);
  await tick();
  backend.settleAll();
  await tick();

  assert.ok(owner.liveCount() <= 5, 'live is ' + owner.liveCount());
  assert.ok(urls.alive() <= 5, 'alive is ' + urls.alive());
});

test('the cap evicts the least recently asked for', async () => {
  const { backend, owner } = setup({ maxLive: 2, maxConcurrent: 50 });

  for (const id of ['a', 'b']) {
    const pending = owner.request(id);
    backend.settle(id);
    await pending;
  }

  /* Touching 'a' makes 'b' the oldest. */
  await owner.request('a');

  const pending = owner.request('c');
  backend.settle('c');
  await pending;

  assert.equal(owner.has('a'), true, 'the recently used one was evicted');
  assert.equal(owner.has('b'), false, 'the oldest one survived');
  assert.equal(owner.has('c'), true);
});

test('a memory with no thumbnail yields null and holds nothing', async () => {
  const { backend, urls, owner } = setup();

  const pending = owner.request('a');
  backend.settle('a', null);

  assert.equal(await pending, null);
  assert.equal(urls.made(), 0);
  assert.equal(owner.liveCount(), 0);
});

test('a failing read is reported and does not wedge the queue', async () => {
  const errors = [];
  const owner = createThumbnailOwner({
    loadThumb: (id) => (id === 'bad' ? Promise.reject(new Error('nope')) : Promise.resolve({ blob: id })),
    createObjectURL: () => 'blob:ok',
    revokeObjectURL: () => {},
    maxConcurrent: 1,
    onError: (error) => errors.push(error.message)
  });

  assert.equal(await owner.request('bad'), null);
  assert.equal(await owner.request('good'), 'blob:ok');
  assert.deepEqual(errors, ['nope']);
});

test('dispose revokes everything and refuses new work', async () => {
  const { backend, urls, owner } = setup({ maxConcurrent: 50 });

  for (const id of ['a', 'b', 'c']) owner.request(id);
  await tick();
  backend.settleAll();
  await tick();

  assert.equal(owner.liveCount(), 3);

  owner.dispose();

  assert.equal(urls.alive(), 0);
  assert.equal(owner.liveCount(), 0);
  assert.equal(await owner.request('d'), null);
});

test('a fast scroll past a thousand rows stays bounded', async () => {
  /* The case the whole module exists for: every row asks, most leave again before their read
     lands, and nothing is allowed to accumulate. */
  const { backend, urls, owner } = setup({ maxLive: 20, maxConcurrent: 4 });

  for (let i = 0; i < 1000; i += 1) {
    owner.request('m' + i);
    if (i % 3 === 0) owner.release('m' + i);

    if (i % 25 === 0) {
      await tick();
      backend.settleAll();
      await tick();
      assert.ok(owner.liveCount() <= 20, 'live grew to ' + owner.liveCount() + ' at row ' + i);
    }
  }

  await tick();
  backend.settleAll();
  await tick();

  assert.ok(urls.alive() <= 20, 'alive is ' + urls.alive());
});
