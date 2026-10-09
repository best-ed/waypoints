/* How tall each histogram bar is drawn, as a percentage of the track.

   The naive version is count / tallest, and it has a failure case that looks like a bug: when
   every bucket holds the same number - which is what happens with one bucket, or with a
   filter that leaves one memory in each of a few months - every bar is the tallest bar, so
   every bar is 100% and the histogram renders as a solid block.

   Pure, so it can be tested without a DOM. */

/* What a bar is drawn at when there is nothing to compare it to. Deliberately not full
   height: a flat histogram should read as flat, not as full. */
export const FLAT_HEIGHT = 45;

/* The shortest a bar with anything in it may be. Without a floor a single memory beside a
   month holding forty is under three pixels in a 48px track, which reads as empty. */
export const MIN_HEIGHT = 14;

export const MAX_HEIGHT = 100;

/* An empty bucket is not a bar at all. It keeps a hairline so the gap reads as a gap rather
   than as the histogram having ended, and that is a border rather than a height. */
export const EMPTY_HEIGHT = 0;

export function barHeights(counts) {
  if (!Array.isArray(counts) || counts.length === 0) {
    return [];
  }

  const occupied = counts.filter((count) => Number.isFinite(count) && count > 0);

  if (occupied.length === 0) {
    return counts.map(() => EMPTY_HEIGHT);
  }

  const tallest = Math.max(...occupied);
  const shortest = Math.min(...occupied);

  /* Every bucket that holds anything holds the same amount. There is no shape to show, so
     the bars sit at a resting height rather than all claiming to be the maximum. */
  if (tallest === shortest) {
    return counts.map((count) => (count > 0 ? FLAT_HEIGHT : EMPTY_HEIGHT));
  }

  return counts.map((count) => {
    if (!Number.isFinite(count) || count <= 0) {
      return EMPTY_HEIGHT;
    }

    return Math.max(MIN_HEIGHT, Math.round((count / tallest) * MAX_HEIGHT));
  });
}
