import { DATE_PATTERN } from '../data/schema.js';
import { applyFilters } from './apply-filters.js';

const MS_PER_DAY = 86400000;

/* Anything above this many months is too many bars to read, so the buckets become
   years instead. */
export const MONTHLY_SPAN_LIMIT = 36;

function padTwo(value) {
  return String(value).padStart(2, '0');
}

/* Built from the parts through Date.UTC, never by parsing the string. new Date("2025-03-04")
   is midnight UTC, which is the previous day for anyone behind UTC, and that error would
   land straight in the histogram. */
export function toDayNumber(date) {
  if (typeof date !== 'string' || !DATE_PATTERN.test(date)) {
    return null;
  }

  const [year, month, day] = date.split('-').map(Number);
  const utc = Date.UTC(year, month - 1, day);

  if (Number.isNaN(utc)) {
    return null;
  }

  return Math.round(utc / MS_PER_DAY);
}

export function fromDayNumber(dayNumber) {
  if (!Number.isFinite(dayNumber)) {
    return null;
  }

  const date = new Date(Math.round(dayNumber) * MS_PER_DAY);

  return [
    date.getUTCFullYear(),
    padTwo(date.getUTCMonth() + 1),
    padTwo(date.getUTCDate())
  ].join('-');
}

function monthsBetween(first, last) {
  const [firstYear, firstMonth] = first.split('-').map(Number);
  const [lastYear, lastMonth] = last.split('-').map(Number);

  return (lastYear - firstYear) * 12 + (lastMonth - firstMonth) + 1;
}

function monthKey(year, month) {
  return year + '-' + padTwo(month);
}

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
];

function monthlyBuckets(firstDate, lastDate) {
  const [firstYear, firstMonth] = firstDate.split('-').map(Number);
  const buckets = [];

  let year = firstYear;
  let month = firstMonth;
  const total = monthsBetween(firstDate, lastDate);

  for (let index = 0; index < total; index++) {
    const start = monthKey(year, month) + '-01';
    const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

    buckets.push({
      key: monthKey(year, month),
      label: MONTH_LABELS[month - 1] + ' ' + year,
      start,
      end: monthKey(year, month) + '-' + padTwo(endDay),
      count: 0
    });

    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return buckets;
}

function yearlyBuckets(firstDate, lastDate) {
  const firstYear = Number(firstDate.slice(0, 4));
  const lastYear = Number(lastDate.slice(0, 4));
  const buckets = [];

  for (let year = firstYear; year <= lastYear; year++) {
    buckets.push({
      key: String(year),
      label: String(year),
      start: year + '-01-01',
      end: year + '-12-31',
      count: 0
    });
  }

  return buckets;
}

/* Every bucket in the span is present, including the empty ones, so the histogram shows
   a gap where nothing happened rather than closing it up. */
export function timelineBuckets(memories, filters = {}) {
  const pool = applyFilters(memories, filters, { except: 'dates' })
    .map((memory) => memory?.date)
    .filter((date) => typeof date === 'string' && DATE_PATTERN.test(date))
    .sort();

  if (pool.length === 0) {
    return { buckets: [], unit: 'month', first: null, last: null };
  }

  const first = pool[0];
  const last = pool[pool.length - 1];
  const unit = monthsBetween(first, last) <= MONTHLY_SPAN_LIMIT ? 'month' : 'year';

  const buckets = unit === 'month' ? monthlyBuckets(first, last) : yearlyBuckets(first, last);
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  for (const date of pool) {
    const key = unit === 'month' ? date.slice(0, 7) : date.slice(0, 4);
    const bucket = byKey.get(key);
    if (bucket) {
      bucket.count += 1;
    }
  }

  return { buckets, unit, first, last };
}

export function distinctDateCount(memories) {
  const dates = new Set();

  for (const memory of Array.isArray(memories) ? memories : []) {
    if (typeof memory?.date === 'string' && DATE_PATTERN.test(memory.date)) {
      dates.add(memory.date);
    }
  }

  return dates.size;
}
