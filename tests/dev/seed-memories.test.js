import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  generateSeedMemories,
  SEED_TAGS,
  MAX_SEED_TAGS,
  SEED_YEARS,
  NAIROBI_SHARE
} from '../../src/js/dev/seed-memories.js';
import { validateStoredMemory } from '../../src/js/data/validate.js';
import { toDayNumber } from '../../src/js/filters/timeline.js';
import { COORDINATE_DECIMALS } from '../../src/js/data/schema.js';

const NOW = () => new Date('2026-10-02T09:00:00.000Z');

/* A seeded generator, so a failure is reproducible rather than a once-in-a-thousand run.
   Mulberry32: small, and good enough to spread a thousand points. */
function seededRandom(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generate(count, seed = 1) {
  return generateSeedMemories(count, { random: seededRandom(seed), now: NOW });
}

test('generates the number asked for', () => {
  assert.equal(generate(0).length, 0);
  assert.equal(generate(1).length, 1);
  assert.equal(generate(250).length, 250);
  assert.equal(generate(1000).length, 1000);
});

test('refuses a count that is not a positive whole number', () => {
  for (const count of [-1, 1.5, Number.NaN, null, undefined, '10', Infinity]) {
    assert.deepEqual(generate(count), [], String(count));
  }
});

/* Everything seeded has to survive the same validation as a hand-typed memory, or the store
   would reject it on the next restore and the seed would be useless. */
test('every record passes stored-memory validation', () => {
  for (const seed of [1, 7, 99]) {
    const invalid = generate(400, seed).filter((memory) => !validateStoredMemory(memory).valid);
    assert.deepEqual(invalid, [], 'seed ' + seed + ' produced invalid records');
  }
});

test('ids are unique', () => {
  const memories = generate(1000);
  assert.equal(new Set(memories.map((memory) => memory.id)).size, memories.length);
});

test('about seven in ten sit around Nairobi', () => {
  const memories = generate(2000);
  const near = memories.filter(
    (memory) => Math.abs(memory.lat + 1.2921) <= 0.3 && Math.abs(memory.lng - 36.8219) <= 0.3
  ).length;

  const share = near / memories.length;
  assert.ok(
    Math.abs(share - NAIROBI_SHARE) < 0.06,
    'clustered share was ' + (share * 100).toFixed(1) + '%'
  );
});

test('the rest are genuinely scattered, not all in one other place', () => {
  const memories = generate(2000);
  const far = memories.filter(
    (memory) => Math.abs(memory.lat + 1.2921) > 0.3 || Math.abs(memory.lng - 36.8219) > 0.3
  );

  assert.ok(far.length > 100, 'only ' + far.length + ' scattered');
  assert.ok(Math.max(...far.map((m) => m.lng)) > 120, 'nothing far east');
  assert.ok(Math.min(...far.map((m) => m.lng)) < -120, 'nothing far west');
  assert.ok(Math.max(...far.map((m) => m.lat)) > 40, 'nothing far north');
  assert.ok(Math.min(...far.map((m) => m.lat)) < -30, 'nothing far south');
});

test('coordinates stay in range', () => {
  for (const memory of generate(1000)) {
    assert.ok(memory.lat >= -90 && memory.lat <= 90, 'lat ' + memory.lat);
    assert.ok(memory.lng >= -180 && memory.lng <= 180, 'lng ' + memory.lng);
  }
});

test('coordinates are rounded like any stored memory', () => {
  for (const memory of generate(500)) {
    for (const value of [memory.lat, memory.lng]) {
      const decimals = (String(value).split('.')[1] ?? '').length;
      assert.ok(decimals <= COORDINATE_DECIMALS, value + ' has ' + decimals + ' decimals');
    }
  }
});

test('dates spread over about ten years, ending no later than today', () => {
  const memories = generate(1000);
  const dates = memories.map((memory) => memory.date).sort();
  const today = NOW().toISOString().slice(0, 10);

  assert.ok(dates[dates.length - 1] <= today, 'latest is ' + dates[dates.length - 1]);

  const spanDays = toDayNumber(dates[dates.length - 1]) - toDayNumber(dates[0]);
  const expected = SEED_YEARS * 365;
  assert.ok(spanDays > expected * 0.9, 'span was only ' + spanDays + ' days');
  assert.ok(spanDays <= expected + SEED_YEARS, 'span was ' + spanDays + ' days');
});

test('dates land in many different years', () => {
  const years = new Set(generate(1000).map((memory) => memory.date.slice(0, 4)));
  assert.ok(years.size >= SEED_YEARS, 'only ' + years.size + ' distinct years');
});

test('every date is a real calendar day', () => {
  for (const memory of generate(1000)) {
    assert.match(memory.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(toDayNumber(memory.date) === null, false);
  }
});

test('timestamps agree with the date', () => {
  for (const memory of generate(200)) {
    assert.ok(memory.createdAt.startsWith(memory.date), memory.createdAt + ' vs ' + memory.date);
    assert.equal(memory.createdAt, memory.updatedAt);
  }
});

test('tags come from the pool, between none and four', () => {
  for (const memory of generate(1000)) {
    assert.ok(memory.tags.length <= MAX_SEED_TAGS, memory.tags.length + ' tags');
    for (const tag of memory.tags) {
      assert.ok(SEED_TAGS.includes(tag), 'unexpected tag ' + tag);
    }
  }
});

test('tags on one memory are unique and sorted', () => {
  for (const memory of generate(1000)) {
    assert.deepEqual(memory.tags, [...new Set(memory.tags)].sort(), JSON.stringify(memory.tags));
  }
});

/* An untagged memory is a case worth seeding: it has to be excluded by every tag filter and
   still counted in the totals. */
test('some memories carry no tags at all', () => {
  const untagged = generate(1000).filter((memory) => memory.tags.length === 0);
  assert.ok(untagged.length > 20, 'only ' + untagged.length + ' untagged');
});

test('the whole tag pool gets used', () => {
  const used = new Set(generate(1000).flatMap((memory) => memory.tags));
  assert.equal(used.size, SEED_TAGS.length);
});

test('no seeded memory references a photo', () => {
  for (const memory of generate(1000)) {
    assert.deepEqual(memory.photoIds, []);
  }
});

test('titles are varied enough to search', () => {
  const titles = new Set(generate(1000).map((memory) => memory.title));
  assert.ok(titles.size > 50, 'only ' + titles.size + ' distinct titles');
});

test('the same seed gives the same memories', () => {
  assert.deepEqual(generate(50, 42), generate(50, 42));
});

test('a different seed gives different memories', () => {
  assert.notDeepEqual(generate(50, 1), generate(50, 2));
});
