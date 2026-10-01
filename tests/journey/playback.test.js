import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createPlayback,
  DWELL_MS,
  IDLE,
  PLAYING,
  PAUSED,
  FINISHED
} from '../../src/js/journey/playback.js';

/* A fake clock rather than real timers: a twelve-stop journey would otherwise take 42
   seconds of wall time, and the test could not assert that nothing is pending. */
function createClock() {
  let nextHandle = 1;
  const pending = new Map();

  return {
    setTimeout(callback, delay) {
      const handle = nextHandle++;
      pending.set(handle, { callback, delay });
      return handle;
    },
    clearTimeout(handle) {
      pending.delete(handle);
    },
    pendingCount() {
      return pending.size;
    },
    pendingDelays() {
      return [...pending.values()].map((entry) => entry.delay);
    },
    /* Fires everything currently pending, once. A callback that schedules again leaves its
       new timer for the next tick, so a runaway chain cannot hang the test. */
    tick() {
      const due = [...pending.entries()];
      pending.clear();
      for (const [, entry] of due) {
        entry.callback();
      }
      return due.length;
    }
  };
}

function setup(count = 3) {
  const clock = createClock();
  const states = [];
  const playback = createPlayback({
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    onListenerError: (error) => {
      throw error;
    }
  });

  playback.subscribe((state) => states.push(state));
  playback.setCount(count);
  states.length = 0;

  return { clock, playback, states };
}

test('starts idle at the first stop with nothing scheduled', () => {
  const { clock, playback } = setup();

  assert.deepEqual(playback.getState(), { status: IDLE, index: 0, count: 3 });
  assert.equal(clock.pendingCount(), 0);
});

test('play moves to playing and schedules one dwell', () => {
  const { clock, playback } = setup();

  playback.play();

  assert.equal(playback.getState().status, PLAYING);
  assert.equal(clock.pendingCount(), 1);
  assert.deepEqual(clock.pendingDelays(), [DWELL_MS]);
});

test('the dwell advances one stop and schedules the next', () => {
  const { clock, playback } = setup();

  playback.play();
  clock.tick();

  assert.deepEqual(playback.getState(), { status: PLAYING, index: 1, count: 3 });
  assert.equal(clock.pendingCount(), 1);
});

test('playing to the end finishes', () => {
  const { clock, playback } = setup(3);

  playback.play();
  clock.tick();
  clock.tick();

  assert.deepEqual(playback.getState(), { status: PLAYING, index: 2, count: 3 });

  clock.tick();

  assert.deepEqual(playback.getState(), { status: FINISHED, index: 2, count: 3 });
});

test('nothing is pending once the journey has finished', () => {
  const { clock, playback } = setup(2);

  playback.play();
  clock.tick();
  clock.tick();

  assert.equal(playback.getState().status, FINISHED);
  assert.equal(clock.pendingCount(), 0, 'no timer outlives the journey');
});

test('a one-stop journey finishes after a single dwell', () => {
  const { clock, playback } = setup(1);

  playback.play();
  assert.equal(playback.getState().status, PLAYING);

  clock.tick();

  assert.deepEqual(playback.getState(), { status: FINISHED, index: 0, count: 1 });
});

test('play from finished restarts at the beginning', () => {
  const { clock, playback } = setup(3);

  playback.play();
  clock.tick();
  clock.tick();
  clock.tick();
  assert.equal(playback.getState().status, FINISHED);

  playback.play();

  assert.deepEqual(playback.getState(), { status: PLAYING, index: 0, count: 3 });
  assert.equal(clock.pendingCount(), 1);
});

test('pause stops playing and clears the timer', () => {
  const { clock, playback } = setup();

  playback.play();
  playback.pause();

  assert.equal(playback.getState().status, PAUSED);
  assert.equal(clock.pendingCount(), 0, 'the dwell is gone, not just ignored');
});

test('play resumes from where it was paused', () => {
  const { clock, playback } = setup(4);

  playback.play();
  clock.tick();
  playback.pause();
  assert.equal(playback.getState().index, 1);

  playback.play();

  assert.deepEqual(playback.getState(), { status: PLAYING, index: 1, count: 4 });
});

test('a paused journey never advances however long the clock runs', () => {
  const { clock, playback } = setup();

  playback.play();
  playback.pause();
  clock.tick();
  clock.tick();

  assert.deepEqual(playback.getState(), { status: PAUSED, index: 0, count: 3 });
});

test('pause does nothing from idle, paused or finished', () => {
  const { clock, playback } = setup();

  playback.pause();
  assert.equal(playback.getState().status, IDLE);

  playback.play();
  playback.pause();
  playback.pause();
  assert.equal(playback.getState().status, PAUSED);

  playback.reset();
  playback.play();
  clock.tick();
  clock.tick();
  clock.tick();
  assert.equal(playback.getState().status, FINISHED);
  playback.pause();
  assert.equal(playback.getState().status, FINISHED);
});

test('play does nothing when already playing and does not stack timers', () => {
  const { clock, playback } = setup();

  playback.play();
  playback.play();
  playback.play();

  assert.equal(clock.pendingCount(), 1, 'one dwell, not three');
});

test('play does nothing with no stops', () => {
  const { clock, playback } = setup(0);

  playback.play();

  assert.deepEqual(playback.getState(), { status: IDLE, index: 0, count: 0 });
  assert.equal(clock.pendingCount(), 0);
});

test('toggle plays then pauses', () => {
  const { playback } = setup();

  playback.toggle();
  assert.equal(playback.getState().status, PLAYING);

  playback.toggle();
  assert.equal(playback.getState().status, PAUSED);

  playback.toggle();
  assert.equal(playback.getState().status, PLAYING);
});

test('next steps forward and pauses when it was not playing', () => {
  const { playback } = setup();

  playback.next();

  assert.deepEqual(playback.getState(), { status: PAUSED, index: 1, count: 3 });
});

test('next while playing keeps playing and restarts the dwell', () => {
  const { clock, playback } = setup();

  playback.play();
  const firstHandle = clock.pendingDelays().length;
  playback.next();

  assert.deepEqual(playback.getState(), { status: PLAYING, index: 1, count: 3 });
  assert.equal(clock.pendingCount(), firstHandle, 'still exactly one dwell pending');
});

test('prev steps back', () => {
  const { playback } = setup();

  playback.next();
  playback.next();
  playback.prev();

  assert.equal(playback.getState().index, 1);
});

/* The boundary no-ops: these must not change state and must not notify, or a held arrow key
   would spam the aria-live region with the same step. */
test('prev at the first stop is a no-op', () => {
  const { playback, states } = setup();

  playback.prev();

  assert.deepEqual(playback.getState(), { status: IDLE, index: 0, count: 3 });
  assert.equal(states.length, 0, 'nobody was notified');
});

test('next at the last stop is a no-op', () => {
  const { playback, states } = setup(3);

  playback.goTo(2);
  states.length = 0;

  playback.next();

  assert.deepEqual(playback.getState(), { status: PAUSED, index: 2, count: 3 });
  assert.equal(states.length, 0, 'nobody was notified');
});

test('next at the last stop does not break out of playing', () => {
  const { clock, playback } = setup(2);

  playback.play();
  playback.next();
  assert.deepEqual(playback.getState(), { status: PLAYING, index: 1, count: 2 });

  playback.next();
  assert.deepEqual(playback.getState(), { status: PLAYING, index: 1, count: 2 });
  assert.equal(clock.pendingCount(), 1);
});

test('next and prev do nothing with no stops', () => {
  const { playback, states } = setup(0);

  playback.next();
  playback.prev();

  assert.equal(states.length, 0);
});

test('prev from finished leaves it paused, not finished', () => {
  const { clock, playback } = setup(3);

  playback.play();
  clock.tick();
  clock.tick();
  clock.tick();
  assert.equal(playback.getState().status, FINISHED);

  playback.prev();

  assert.deepEqual(playback.getState(), { status: PAUSED, index: 1, count: 3 });
});

test('goTo jumps to a stop', () => {
  const { playback } = setup(5);

  playback.goTo(3);

  assert.deepEqual(playback.getState(), { status: PAUSED, index: 3, count: 5 });
});

test('goTo while playing keeps playing and restarts the dwell', () => {
  const { clock, playback } = setup(5);

  playback.play();
  playback.goTo(4);

  assert.equal(playback.getState().status, PLAYING);
  assert.equal(clock.pendingCount(), 1);
});

test('goTo ignores an index outside the journey', () => {
  const { playback, states } = setup(3);

  for (const target of [-1, 3, 99]) {
    playback.goTo(target);
  }

  assert.deepEqual(playback.getState(), { status: IDLE, index: 0, count: 3 });
  assert.equal(states.length, 0);
});

test('goTo ignores a value that is not a whole number', () => {
  const { playback, states } = setup(3);

  for (const target of [1.5, Number.NaN, null, undefined, '1', Infinity]) {
    playback.goTo(target);
  }

  assert.equal(states.length, 0);
});

/* Selecting the stop that is already current happens constantly - a list click reselects
   the same memory - and it must stay silent, exactly like selection.select does. */
test('goTo the current stop is a no-op', () => {
  const { playback, states } = setup(3);

  playback.goTo(0);

  assert.equal(states.length, 0);
});

test('goTo the current stop does leave finished, since there is somewhere to go', () => {
  const { clock, playback } = setup(2);

  playback.play();
  clock.tick();
  clock.tick();
  assert.equal(playback.getState().status, FINISHED);

  playback.goTo(1);

  assert.deepEqual(playback.getState(), { status: PAUSED, index: 1, count: 2 });
});

test('reset returns to idle at the start and clears the timer', () => {
  const { clock, playback } = setup(4);

  playback.play();
  clock.tick();
  playback.reset();

  assert.deepEqual(playback.getState(), { status: IDLE, index: 0, count: 4 });
  assert.equal(clock.pendingCount(), 0);
});

test('reset from finished goes back to idle', () => {
  const { clock, playback } = setup(2);

  playback.play();
  clock.tick();
  clock.tick();
  playback.reset();

  assert.equal(playback.getState().status, IDLE);
});

/* A filter change rebuilds the journey, so the old index means nothing. */
test('a changed count resets playback to idle', () => {
  const { clock, playback } = setup(5);

  playback.play();
  clock.tick();
  clock.tick();
  assert.equal(playback.getState().index, 2);

  playback.setCount(3);

  assert.deepEqual(playback.getState(), { status: IDLE, index: 0, count: 3 });
  assert.equal(clock.pendingCount(), 0, 'the old dwell is gone');
});

test('an unchanged count leaves playback alone', () => {
  const { clock, playback, states } = setup(3);

  playback.play();
  clock.tick();
  states.length = 0;

  playback.setCount(3);

  assert.deepEqual(playback.getState(), { status: PLAYING, index: 1, count: 3 });
  assert.equal(states.length, 0, 'an unrelated re-render does not stop playback');
  assert.equal(clock.pendingCount(), 1);
});

test('a count of zero empties the journey', () => {
  const { playback } = setup(3);

  playback.setCount(0);

  assert.deepEqual(playback.getState(), { status: IDLE, index: 0, count: 0 });
});

test('a nonsense count reads as empty', () => {
  const { playback } = setup(3);

  for (const value of [-1, 1.5, Number.NaN, null, undefined, '3']) {
    playback.setCount(value);
    assert.equal(playback.getState().count, 0, String(value));
    playback.setCount(3);
  }
});

test('subscribers see every transition', () => {
  const { clock, playback, states } = setup(3);

  playback.play();
  clock.tick();
  playback.pause();
  playback.next();
  playback.reset();

  assert.deepEqual(
    states.map((state) => state.status + ':' + state.index),
    ['playing:0', 'playing:1', 'paused:1', 'paused:2', 'idle:0']
  );
});

test('unsubscribing stops the notifications', () => {
  const { playback } = setup();
  const seen = [];
  const unsubscribe = playback.subscribe((state) => seen.push(state.status));

  playback.play();
  unsubscribe();
  playback.pause();

  assert.deepEqual(seen, [PLAYING]);
});

test('a throwing listener does not stop the others or the machine', () => {
  const clock = createClock();
  const errors = [];
  const seen = [];
  const playback = createPlayback({
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    onListenerError: (error) => errors.push(error.message)
  });

  playback.setCount(3);
  playback.subscribe(() => {
    throw new Error('listener blew up');
  });
  playback.subscribe((state) => seen.push(state.index));

  playback.play();

  assert.deepEqual(errors, ['listener blew up']);
  assert.deepEqual(seen, [0]);
  assert.equal(playback.getState().status, PLAYING);
});

/* Journey mode exits by disposing, and nothing may fire afterwards - a stray dwell would
   open a popup over a map that is no longer in journey mode. */
test('dispose clears the timer and drops the listeners', () => {
  const { clock, playback, states } = setup(4);

  playback.play();
  playback.dispose();

  assert.equal(clock.pendingCount(), 0);
  assert.equal(clock.tick(), 0, 'nothing left to fire');

  states.length = 0;
  playback.play();
  assert.equal(states.length, 0, 'the old subscriber is gone');
});

test('dispose empties the state', () => {
  const { clock, playback } = setup(4);

  playback.play();
  clock.tick();
  playback.dispose();

  assert.deepEqual(playback.getState(), { status: IDLE, index: 0, count: 0 });
});

/* The structural guarantee: exactly one timer can ever be outstanding, whatever order the
   controls are hit in. */
test('no sequence of controls leaves more than one dwell pending', () => {
  const { clock, playback } = setup(6);
  const actions = [
    () => playback.play(),
    () => playback.pause(),
    () => playback.next(),
    () => playback.prev(),
    () => playback.goTo(3),
    () => playback.toggle(),
    () => playback.reset(),
    () => clock.tick()
  ];

  for (let seed = 0; seed < 400; seed++) {
    let value = seed;
    for (let step = 0; step < 5; step++) {
      actions[value % actions.length]();
      value = Math.floor(value / actions.length) + 1;
      assert.ok(clock.pendingCount() <= 1, 'pending dwells: ' + clock.pendingCount());
    }
  }
});

test('a dwell that fires after a pause does nothing', () => {
  const clock = createClock();
  const playback = createPlayback({
    setTimeout: clock.setTimeout,
    /* Deliberately deaf: simulates a timer already in flight when pause lands. */
    clearTimeout: () => {}
  });

  playback.setCount(3);
  playback.play();
  playback.pause();
  clock.tick();

  assert.deepEqual(playback.getState(), { status: PAUSED, index: 0, count: 3 });
});
