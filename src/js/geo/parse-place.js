/* Nominatim's boundingbox is [south, north, west, east] as strings. Leaflet wants
   [[south, west], [north, east]] as numbers. */
function toBounds(boundingbox) {
  if (!Array.isArray(boundingbox) || boundingbox.length !== 4) {
    return null;
  }

  const [south, north, west, east] = boundingbox.map(Number);
  if (![south, north, west, east].every(Number.isFinite)) {
    return null;
  }

  return [
    [south, west],
    [north, east]
  ];
}

function firstUsefulString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  }
  return '';
}

export function toPlaceResult(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const lat = Number(raw.lat);
  const lng = Number(raw.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const displayName = firstUsefulString(raw.display_name);
  /* display_name is the full comma-separated chain. Its first segment is the place
     itself, which is the closest thing to a short label when name is absent. */
  const name = firstUsefulString(raw.name, displayName.split(',')[0]);

  if (name === '') {
    return null;
  }

  return {
    id: String(raw.place_id ?? name + ':' + lat + ':' + lng),
    name,
    displayName: displayName || name,
    lat,
    lng,
    bounds: toBounds(raw.boundingbox)
  };
}

export function toPlaceResults(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map(toPlaceResult).filter((result) => result !== null);
}

/* Most specific first. A pin dropped on a street should suggest that street, not the
   country it sits in. */
const ADDRESS_PARTS = [
  'neighbourhood',
  'suburb',
  'quarter',
  'hamlet',
  'village',
  'town',
  'city_district',
  'city',
  'municipality',
  'county',
  'state',
  'country'
];

/* Never the whole display_name: that is a long chain ending in the country, which is
   noise in a place name field. */
export function shortPlaceName(reverseResult) {
  if (!reverseResult || typeof reverseResult !== 'object') {
    return '';
  }

  const direct = firstUsefulString(reverseResult.name);
  if (direct !== '') {
    return direct;
  }

  const address = reverseResult.address;
  if (!address || typeof address !== 'object') {
    return firstUsefulString(String(reverseResult.display_name ?? '').split(',')[0]);
  }

  const road = firstUsefulString(address.road, address.pedestrian, address.footway);
  const area = firstUsefulString(...ADDRESS_PARTS.map((part) => address[part]));

  if (road !== '' && area !== '') {
    return road + ', ' + area;
  }

  return firstUsefulString(road, area, String(reverseResult.display_name ?? '').split(',')[0]);
}
