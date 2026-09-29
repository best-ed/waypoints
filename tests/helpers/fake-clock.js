/* A controllable clock and timer queue. Nothing waits in real time, so a test can assert
   on a one second gap without taking a second to run. */
export function createFakeClock(startMs = 0) {
  let current = startMs;
  let nextId = 1;
  const timers = new Map();

  function setTimeout(callback, delay = 0) {
    const id = nextId++;
    timers.set(id, { runAt: current + delay, callback });
    return id;
  }

  function clearTimeout(id) {
    timers.delete(id);
  }

  function due(limit) {
    return [...timers.entries()]
      .filter(([, timer]) => timer.runAt <= limit)
      .sort((a, b) => a[1].runAt - b[1].runAt);
  }

  /* Advances to each timer's own due time rather than jumping straight to the end, so
     anything scheduled by a callback still fires in the right order. */
  async function advance(ms) {
    const target = current + ms;

    let pending = due(target);
    while (pending.length > 0) {
      const [id, timer] = pending[0];
      timers.delete(id);
      current = Math.max(current, timer.runAt);
      timer.callback();
      await Promise.resolve();
      pending = due(target);
    }

    current = target;
    await Promise.resolve();
  }

  /* Lets queued promise callbacks run without moving the clock. */
  async function flush(times = 5) {
    for (let index = 0; index < times; index++) {
      await Promise.resolve();
    }
  }

  return {
    now: () => current,
    setTimeout,
    clearTimeout,
    advance,
    flush,
    pendingCount: () => timers.size
  };
}
