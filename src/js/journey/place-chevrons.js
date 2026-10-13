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

function intersects(a, b, bounds) {
  return (
    Math.min(a.x, b.x) <= bounds.maxX &&
    Math.max(a.x, b.x) >= bounds.minX &&
    Math.min(a.y, b.y) <= bounds.maxY &&
    Math.max(a.y, b.y) >= bounds.minY
  );
}

/* Projected points for one line, and the smallest gap in pixels between two chevrons.

   The first sits half a gap in, so a path barely longer than the spacing still gets one and it
   is not jammed against the pin at either end. `bounds` is the screen rectangle worth drawing
   in: off-screen stretches are stepped over whole rather than walked a chevron at a time,
   because at a close zoom a journey across an ocean is millions of pixels long. */
export function placeChevrons(points, minSpacing, { bounds = null } = {}) {
  const path = Array.isArray(points) ? points : [];
  const spacing = Number.isFinite(minSpacing) && minSpacing > 0 ? minSpacing : 0;

  if (path.length < 2 || spacing === 0) {
    return [];
  }

  const placements = [];
  let travelled = 0;
  let nextAt = spacing / 2;

  for (let index = 1; index < path.length; index++) {
    const from = path[index - 1];
    const to = path[index];

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.sqrt(dx * dx + dy * dy);

    if (length === 0) {
      continue;
    }

    const end = travelled + length;

    if (bounds && !intersects(from, to, bounds)) {
      /* Stepped over in one go. Walking it would be millions of iterations producing nothing. */
      if (nextAt <= end) {
        nextAt += (Math.floor((end - nextAt) / spacing) + 1) * spacing;
      }
      travelled = end;
      continue;
    }

    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

    while (nextAt <= end && placements.length < MAX_CHEVRONS) {
      const along = (nextAt - travelled) / length;

      placements.push({
        x: from.x + dx * along,
        y: from.y + dy * along,
        angle
      });

      nextAt += spacing;
    }

    travelled = end;

    if (placements.length >= MAX_CHEVRONS) {
      break;
    }
  }

  return placements;
}
