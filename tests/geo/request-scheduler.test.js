import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createRequestScheduler,
  RequestSupersededError,
  RequestTimeoutError,
  MIN_INTERVAL_MS
} from '../../src/js/geo/request-scheduler.js';
import { createFakeClock } from '../helpers/fake-clock.js';

/* Never answers on its own but does honour the abort signal, which is what a real fetch
   does. A promise that ignores the signal hangs the suite instead of failing it. */
function hangs(url, options) {
  return new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
  });
}

function setup({ respond } = {}) {
  const clock = createFakeClock();
  const calls = [];

  const fetchImpl = async (url, options) => {
    calls.push({ url, at: clock.now(), signal: options?.signal });

    if (respond) {
      return respond(url, options, clock);
    }
    return { ok: true, url };
  };

  const scheduler = createRequestScheduler({
    fetch: fetchImpl,
    now: clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout
  });

  return { clock, calls, scheduler };
}

test('runs a single request straight away', async () => {
  const { scheduler, calls } = setup();

  const result = await scheduler.run('/first');

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/first');
});

/* The usage policy made testable: five submits in a burst must still leave at least a
   second between the requests that actually go out. */
test('keeps at least the minimum interval between requests', async () => {
  const { scheduler, clock, calls } = setup();

  const first = scheduler.run('/a');
  await clock.flush();
  await first;

  const second = scheduler.run('/b');
  await clock.advance(MIN_INTERVAL_MS);
  await second;

  const third = scheduler.run('/c');
  await clock.advance(MIN_INTERVAL_MS);
  await third;

  assert.equal(calls.length, 3);
  assert.ok(calls[1].at - calls[0].at >= MIN_INTERVAL_MS, 'gap one is at least a second');
  assert.ok(calls[2].at - calls[1].at >= MIN_INTERVAL_MS, 'gap two is at least a second');
});

test('does not delay a request that comes long after the last one', async () => {
  const { scheduler, clock, calls } = setup();

  await scheduler.run('/a');
  await clock.advance(MIN_INTERVAL_MS * 5);

  const second = scheduler.run('/b');
  await clock.flush();
  await second;

  assert.equal(calls.length, 2);
  assert.equal(calls[1].at, calls[0].at + MIN_INTERVAL_MS * 5);
});

test('aborts the request in flight when a new one starts', async () => {
  const { scheduler, clock } = setup({ respond: hangs });

  const first = scheduler.run('/old');
  await clock.flush();

  const second = scheduler.run('/new');

  await assert.rejects(first, RequestSupersededError);

  /* The second request is holding its spacing slot. It only reaches the abort check once
     that wait is over, so the clock has to move before it can reject. */
  scheduler.abortCurrent();
  await clock.advance(MIN_INTERVAL_MS);

  await assert.rejects(second, RequestSupersededError);
});

/* Mashing submit must not fire a request per press: everything superseded drops out at
   its spacing slot without ever reaching fetch. */
test('a burst of submits only sends the last request', async () => {
  const { scheduler, clock, calls } = setup();

  const attempts = ['/a', '/b', '/c', '/d', '/e'].map((url) => scheduler.run(url).catch((error) => error));

  await clock.advance(MIN_INTERVAL_MS * 5);
  const results = await Promise.all(attempts);

  assert.equal(calls.length, 1, 'only one request reached fetch');
  assert.equal(calls[0].url, '/e');

  for (const result of results.slice(0, 4)) {
    assert.ok(result instanceof RequestSupersededError);
  }
  assert.equal(results[4].ok, true);
});

test('passes an abort signal to fetch', async () => {
  const { scheduler, calls, clock } = setup();

  const request = scheduler.run('/a');
  await clock.flush();
  await request;

  assert.ok(calls[0].signal, 'fetch received a signal');
  assert.equal(calls[0].signal.aborted, false);
});

test('an externally aborted request never reaches fetch', async () => {
  const { scheduler, calls } = setup();
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(() => scheduler.run('/a', { signal: controller.signal }), RequestSupersededError);

  assert.equal(calls.length, 0);
});

test('aborting from outside rejects the request', async () => {
  const { scheduler, clock } = setup({ respond: hangs });
  const controller = new AbortController();

  const request = scheduler.run('/a', { signal: controller.signal });
  await clock.flush();
  controller.abort();

  await assert.rejects(request, RequestSupersededError);
});

test('times out a request that never settles', async () => {
  const { scheduler, clock } = setup({ respond: hangs });

  const request = scheduler.run('/slow');
  await clock.flush();
  await clock.advance(8000);

  await assert.rejects(request, RequestTimeoutError);
});

test('does not time out a request that settles in time', async () => {
  const { scheduler, clock } = setup({
    respond: () => Promise.resolve({ ok: true })
  });

  const request = scheduler.run('/quick');
  await clock.flush();
  await clock.advance(7999);

  assert.equal((await request).ok, true);
});

test('clears the timeout once a request settles', async () => {
  const { scheduler, clock } = setup();

  const request = scheduler.run('/a');
  await clock.flush();
  await request;
  await clock.flush();

  assert.equal(clock.pendingCount(), 0, 'no timer left behind');
});

test('a failed request does not wedge the queue', async () => {
  let attempt = 0;
  const { scheduler, clock, calls } = setup({
    respond: () => {
      attempt++;
      if (attempt === 1) {
        return Promise.reject(new Error('network down'));
      }
      return Promise.resolve({ ok: true });
    }
  });

  const first = scheduler.run('/a');
  await clock.flush();
  await assert.rejects(first);

  const second = scheduler.run('/b');
  await clock.advance(MIN_INTERVAL_MS);

  assert.equal((await second).ok, true);
  assert.equal(calls.length, 2);
});

test('lets a network failure through unchanged', async () => {
  const boom = new TypeError('Failed to fetch');
  const { scheduler, clock } = setup({ respond: () => Promise.reject(boom) });

  const request = scheduler.run('/a');
  await clock.flush();

  await assert.rejects(request, (error) => {
    assert.equal(error, boom);
    return true;
  });
});

test('reports when the last request started', async () => {
  const { scheduler, clock } = setup();

  assert.equal(scheduler.lastStartedAt(), -Infinity);

  const request = scheduler.run('/a');
  await clock.flush();
  await request;

  assert.equal(scheduler.lastStartedAt(), clock.now());
});

test('forwards fetch options such as headers', async () => {
  const clock = createFakeClock();
  const seen = [];

  const scheduler = createRequestScheduler({
    fetch: async (url, options) => {
      seen.push(options);
      return { ok: true };
    },
    now: clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout
  });

  const request = scheduler.run('/a', { headers: { 'Accept-Language': 'sw-KE' } });
  await clock.flush();
  await request;

  assert.equal(seen[0].headers['Accept-Language'], 'sw-KE');
  assert.ok(seen[0].signal, 'the scheduler still supplies its own signal');
});
