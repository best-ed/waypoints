import { DATE_PATTERN } from '../data/schema.js';
import { haversineKm } from './geometry.js';
import { journeyOrder, journeySegments } from './journey-order.js';

const DISPLAY_LOCALE = 'en-GB';
const MONTH_YEAR_OPTIONS = { month: 'short', year: 'numeric', timeZone: 'UTC' };

let monthYearFormatter = null;
let distanceFormatter = null;

/* Built on first use, not at import time: constructing an Intl formatter is expensive and
   modules must not do work when loaded. Same reasoning as ui/format-date.js. */
function monthYear() {
  if (!monthYearFormatter) {
    monthYearFormatter = new Intl.DateTimeFormat(DISPLAY_LOCALE, MONTH_YEAR_OPTIONS);
  }
  return monthYearFormatter;
}

function distance() {
  if (!distanceFormatter) {
    distanceFormatter = new Intl.NumberFormat(DISPLAY_LOCALE, { maximumFractionDigits: 0 });
  }
  return distanceFormatter;
}

/* The parts go in through Date.UTC and come back out in UTC, so a stored calendar day never
   formats as the day before for anyone behind UTC. */
export function formatMonthYear(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    return '';
  }

  const [year, month, day] = value.split('-').map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));

  if (Number.isNaN(utcDate.getTime())) {
    return '';
  }

  return monthYear().format(utcDate);
}

/* Distance is summed over the drawn segments, so a pair pinned at the same spot contributes
   nothing - which is also what the map shows. */
export function journeySummary(memories) {
  const stops = journeyOrder(memories);
  const segments = journeySegments(stops);

  const distanceKm = segments.reduce(
    (total, segment) => total + haversineKm(segment.from, segment.to),
    0
  );

  return {
    distanceKm,
    count: stops.length,
    first: stops.length > 0 ? stops[0].date : null,
    last: stops.length > 0 ? stops[stops.length - 1].date : null
  };
}

export function formatDistanceKm(distanceKm) {
  if (!Number.isFinite(distanceKm)) {
    return '0 km';
  }

  return distance().format(Math.round(distanceKm)) + ' km';
}

/* Reads as "1,240 km · 12 memories · Mar 2019 to Jun 2024". A journey inside one month
   says that month once rather than repeating it either side of "to". */
export function formatJourneySummary(summary) {
  if (!summary || summary.count === 0) {
    return '';
  }

  const parts = [
    formatDistanceKm(summary.distanceKm),
    summary.count === 1 ? '1 memory' : summary.count + ' memories'
  ];

  const first = formatMonthYear(summary.first);
  const last = formatMonthYear(summary.last);

  if (first && last) {
    parts.push(first === last ? first : first + ' to ' + last);
  }

  return parts.join(' · ');
}
