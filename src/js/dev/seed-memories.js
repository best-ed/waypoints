import { roundCoordinate } from '../data/normalize.js';
import { fromDayNumber, toDayNumber } from '../filters/timeline.js';

/* Roughly seven in ten memories sit around one city, which is what a real collection looks
   like: a home base plus trips. A uniform worldwide scatter would make clustering look like
   it works when the hard case is a dense cluster. */
export const NAIROBI_SHARE = 0.7;

const NAIROBI = { lat: -1.2921, lng: 36.8219 };

/* About 25km either way, so a seeded cluster spans a city rather than a continent. */
const CLUSTER_SPREAD_DEGREES = 0.25;

/* The poles hold nothing worth pinning, and a uniform latitude would put a tenth of the
   scatter on ice. */
const WORLD_LAT_MIN = -55;
const WORLD_LAT_MAX = 70;

export const SEED_YEARS = 10;
const DAYS_PER_YEAR = 365.25;

export const MAX_SEED_TAGS = 4;

export const SEED_TAGS = Object.freeze([
  'beach',
  'food',
  'trail',
  'view',
  'sunset',
  'city',
  'museum',
  'market',
  'hike',
  'coffee',
  'family',
  'friends',
  'work',
  'birthday',
  'roadtrip',
  'camping',
  'rain',
  'night',
  'architecture',
  'wildlife'
]);

const ACTIVITIES = Object.freeze([
  'Morning walk',
  'Evening market',
  'Coffee stop',
  'Long drive',
  'Rooftop sunset',
  'Weekend hike',
  'Quiet afternoon',
  'Street food',
  'Museum visit',
  'Camping night',
  'River crossing',
  'Birthday dinner',
  'Early start',
  'Rainy day',
  'Late night walk',
  'Family lunch'
]);

const PLACES = Object.freeze([
  'in Karura',
  'in Westlands',
  'by the lake',
  'on the ridge',
  'near the old town',
  'downtown',
  'at the harbour',
  'off the main road',
  'in the valley',
  'by the station'
]);

const NOTES = Object.freeze([
  'Worth coming back to.',
  'Too hot to stand still.',
  'Nobody else around.',
  'Found it by accident.',
  'Longer walk than expected.'
]);

function pick(list, random) {
  return list[Math.floor(random() * list.length)];
}

function spread(random) {
  return (random() * 2 - 1) * CLUSTER_SPREAD_DEGREES;
}

function coordinates(random) {
  if (random() < NAIROBI_SHARE) {
    return {
      lat: roundCoordinate(NAIROBI.lat + spread(random)),
      lng: roundCoordinate(NAIROBI.lng + spread(random))
    };
  }

  return {
    lat: roundCoordinate(WORLD_LAT_MIN + random() * (WORLD_LAT_MAX - WORLD_LAT_MIN)),
    lng: roundCoordinate(random() * 360 - 180)
  };
}

function tagsFor(random) {
  /* Zero tags is a real case worth seeding: an untagged memory has to survive every tag
     filter and still be counted. */
  const wanted = Math.floor(random() * (MAX_SEED_TAGS + 1));
  const tags = new Set();

  while (tags.size < wanted) {
    tags.add(pick(SEED_TAGS, random));
  }

  return [...tags].sort();
}

/* Dates are built from day numbers rather than by subtracting milliseconds from a Date, for
   the same reason as everywhere else here: a calendar day must not shift under a timezone. */
export function generateSeedMemories(count, { random = Math.random, now = () => new Date() } = {}) {
  const wanted = Number.isInteger(count) && count > 0 ? count : 0;
  const todayNumber = toDayNumber(now().toISOString().slice(0, 10));
  const span = Math.round(SEED_YEARS * DAYS_PER_YEAR);

  const memories = [];

  for (let index = 0; index < wanted; index++) {
    const { lat, lng } = coordinates(random);
    const date = fromDayNumber(todayNumber - Math.floor(random() * span));
    const timestamp = date + 'T12:00:00.000Z';

    memories.push({
      id: 'seed-' + index,
      title: pick(ACTIVITIES, random) + ' ' + pick(PLACES, random),
      note: random() < 0.4 ? pick(NOTES, random) : '',
      date,
      lat,
      lng,
      placeName: random() < 0.5 ? pick(PLACES, random).replace(/^(in|by|on|near|at|off) (the )?/, '') : '',
      tags: tagsFor(random),
      /* Seeding writes no blobs, so referencing one would leave the record pointing at
         nothing and the orphan sweep would have opinions about it. */
      photoIds: [],
      createdAt: timestamp,
      updatedAt: timestamp
    });
  }

  return memories;
}
