import { fromDayNumber, toDayNumber } from '../filters/timeline.js';
import { formatMemoryDate } from './format-date.js';

const MIN_DISTINCT_DATES = 2;

function buildBar(bucket, tallest, isInRange) {
  const item = document.createElement('li');
  item.className = 'timeline-bar' + (isInRange ? ' is-in-range' : '');

  const fill = document.createElement('span');
  fill.className = 'timeline-bar-fill';
  /* A bucket with nothing in it still gets a sliver, so the gap reads as a gap rather
     than as the histogram ending. */
  fill.style.height = bucket.count === 0 ? '2px' : Math.round((bucket.count / tallest) * 100) + '%';
  item.append(fill);

  /* Title rather than a rendered label: there is no room for one under every bar, and
     the bars are aria-hidden because the handles carry the accessible values. */
  item.title = bucket.label + ': ' + bucket.count;

  return item;
}

export function createTimelineView({
  container,
  barsElement,
  startElement,
  endElement,
  onChange
}) {
  let span = { first: null, last: null };

  function dayBounds() {
    return {
      min: toDayNumber(span.first),
      max: toDayNumber(span.last)
    };
  }

  function describe(input, dayNumber) {
    const date = fromDayNumber(dayNumber);
    /* Screen readers would otherwise announce a raw day number, which means nothing. */
    input.setAttribute('aria-valuetext', date ? formatMemoryDate(date) : '');
  }

  function readRange() {
    const start = Number(startElement.value);
    const end = Number(endElement.value);

    return {
      from: fromDayNumber(Math.min(start, end)),
      to: fromDayNumber(Math.max(start, end))
    };
  }

  /* Handles clamp against each other rather than swapping, so dragging one past the
     other stops at the other instead of turning the range inside out. */
  function clamp(moved, other, isStart) {
    const movedValue = Number(moved.value);
    const otherValue = Number(other.value);

    if (isStart && movedValue > otherValue) {
      moved.value = String(otherValue);
    } else if (!isStart && movedValue < otherValue) {
      moved.value = String(otherValue);
    }
  }

  function handleInput(moved, other, isStart) {
    clamp(moved, other, isStart);
    describe(startElement, Number(startElement.value));
    describe(endElement, Number(endElement.value));
    onChange(readRange());
  }

  function render({ buckets, first, last }, { from, to }, distinctDates) {
    span = { first, last };

    const enoughDates = distinctDates >= MIN_DISTINCT_DATES && buckets.length > 0;
    container.hidden = !enoughDates;

    if (!enoughDates) {
      barsElement.replaceChildren();
      return;
    }

    const { min, max } = dayBounds();
    const startDay = toDayNumber(from) ?? min;
    const endDay = toDayNumber(to) ?? max;

    for (const [input, value] of [
      [startElement, Math.max(min, Math.min(startDay, max))],
      [endElement, Math.max(min, Math.min(endDay, max))]
    ]) {
      input.min = String(min);
      input.max = String(max);
      input.step = '1';
      if (input.value !== String(value)) {
        input.value = String(value);
      }
      describe(input, value);
    }

    const selectedStart = Number(startElement.value);
    const selectedEnd = Number(endElement.value);
    const tallest = Math.max(...buckets.map((bucket) => bucket.count), 1);

    barsElement.replaceChildren(
      ...buckets.map((bucket) => {
        const bucketStart = toDayNumber(bucket.start);
        const bucketEnd = toDayNumber(bucket.end);
        const inRange = bucketEnd >= selectedStart && bucketStart <= selectedEnd;
        return buildBar(bucket, tallest, inRange);
      })
    );
  }

  startElement.addEventListener('input', () => handleInput(startElement, endElement, true));
  endElement.addEventListener('input', () => handleInput(endElement, startElement, false));

  return { render };
}
