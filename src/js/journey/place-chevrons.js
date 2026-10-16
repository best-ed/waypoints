/* Where the direction arrows go, measured in pixels on the screen rather than in legs.

   One chevron per leg meant a chevron every few pixels where a journey doubles back through
   the same city and none at all across an ocean: the spacing followed the data instead of
   following what anybody can see. Spacing by on-screen distance gives the same density
   wherever you are and at whatever zoom, which is the only thing a direction marker is for.

   Pure, and in screen space on purpose: the caller projects the path, which is the one step
   that needs the map. */

/* A rough bound on how many can be on screen at once, so a path that folds back on itself
   inside the viewport cannot fill it with arrows. */
export const MAX_CHEVRONS = 120;

/* The stretch of a piece of the path that is inside the rectangle, as two fractions of it, or
   null when none of it is. Liang-Barsky, because the alternative at a close zoom is walking a
   leg that is ten million pixels long one chevron at a time to find the few hundred that show.
   Both ends matter: a leg can enter the viewport and leave it again. */
function visibleRange(from, to, bounds) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  const edge = [-dx, dx, -dy, dy];
  const room = [from.x - bounds.minX, bounds.maxX - from.x, from.y - bounds.minY, bounds.maxY - from.y];

  let start = 0;
  let end = 1;

  for (let index = 0; index < 4; index++) {
    if (edge[index] === 0) {
      /* Parallel to this edge: either wholly inside it or wholly outside. */
      if (room[index] < 0) {
        return null;
      }
      continue;
    }

    const crossing = room[index] / edge[index];

    if (edge[index] < 0) {
      if (crossing > end) {
        return null;
      }
      start = Math.max(start, crossing);
    } else {
      if (crossing < start) {
        return null;
      }
      end = Math.min(end, crossing);
    }
  }

  return { start, end };
}

/* Projected points for one line, and the smallest gap in pixels between two chevrons.

   The first sits half a gap in, so a path barely longer than the spacing still gets one and it
   is not jammed against the pin at either end. `bounds` is the screen rectangle worth drawing
   in: the offsets are still counted along the whole path, so a chevron never shifts because the
   map moved, but only the ones that land inside are produced. */
export function placeChevrons(points, minSpacing, { bounds = null } = {}) {
  const path = Array.isArray(points) ? points : [];
  const spacing = Number.isFinite(minSpacing) && minSpacing > 0 ? minSpacing : 0;

  if (path.length < 2 || spacing === 0) {
    return [];
  }

  const placements = [];
  let travelled = 0;
  let nextAt = spacing / 2;

  /* Always a whole number of gaps, so skipping what cannot be seen never moves the ones that
     can be. */
  const skipTo = (target) => {
    if (nextAt < target) {
      nextAt += Math.ceil((target - nextAt) / spacing) * spacing;
    }
  };

  for (let index = 1; index < path.length && placements.length < MAX_CHEVRONS; index++) {
    const from = path[index - 1];
    const to = path[index];

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.sqrt(dx * dx + dy * dy);

    if (length === 0) {
      continue;
    }

    const ends = travelled + length;
    const range = bounds ? visibleRange(from, to, bounds) : { start: 0, end: 1 };

    if (range) {
      skipTo(travelled + range.start * length);

      const lastVisible = travelled + range.end * length;
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

      while (nextAt <= lastVisible && placements.length < MAX_CHEVRONS) {
        const along = (nextAt - travelled) / length;

        placements.push({
          x: from.x + dx * along,
          y: from.y + dy * along,
          angle
        });

        nextAt += spacing;
      }
    }

    skipTo(ends);
    travelled = ends;
  }

  return placements;
}
