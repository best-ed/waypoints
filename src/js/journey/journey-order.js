function ascending(a, b) {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

function hasCoordinates(memory) {
  return Number.isFinite(memory?.lat) && Number.isFinite(memory?.lng);
}

/* Oldest first, the opposite of ui/sort-for-list.js: a journey is walked forwards in time
   while the sidebar reads newest at the top. Dates compare as strings, never as Dates. */
export function journeyOrder(memories) {
  return (Array.isArray(memories) ? memories : []).filter(hasCoordinates).sort((a, b) => {
    const byDate = ascending(a.date, b.date);
    return byDate === 0 ? ascending(a.createdAt, b.createdAt) : byDate;
  });
}

function samePlace(a, b) {
  return a.lat === b.lat && a.lng === b.lng;
}

/* Two memories pinned at the same spot have nothing to draw between them, and a
   zero-length polyline still renders as a dot and still gets a chevron. The stop numbering
   is unaffected: the indices stay those of the ordered list, so a dropped segment leaves a
   gap in the segment list, never in the steps. */
export function journeySegments(ordered) {
  const stops = Array.isArray(ordered) ? ordered : [];
  const segments = [];

  for (let index = 0; index < stops.length - 1; index++) {
    const from = stops[index];
    const to = stops[index + 1];

    if (samePlace(from, to)) {
      continue;
    }

    segments.push({ from, to, fromIndex: index, toIndex: index + 1 });
  }

  return segments;
}
