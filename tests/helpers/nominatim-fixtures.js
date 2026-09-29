/* Trimmed from real jsonv2 responses: the fields the parsers read, with the shapes and
   string types Nominatim actually returns (lat and lon as strings, boundingbox as four
   strings in south, north, west, east order). */

export const searchNairobi = [
  {
    place_id: 298060458,
    licence: 'Data © OpenStreetMap contributors, ODbL 1.0.',
    osm_type: 'relation',
    osm_id: 3492709,
    lat: '-1.2832533',
    lon: '36.8172449',
    category: 'boundary',
    type: 'administrative',
    place_rank: 12,
    importance: 0.6626,
    addresstype: 'city',
    name: 'Nairobi',
    display_name: 'Nairobi, Kenya',
    boundingbox: ['-1.4449849', '-1.1605795', '36.6509378', '37.1038879']
  },
  {
    place_id: 297999173,
    osm_type: 'node',
    osm_id: 3160117563,
    lat: '-1.3026148',
    lon: '36.8266273',
    name: 'Nairobi National Park',
    display_name: 'Nairobi National Park, Langata, Nairobi, Kenya',
    boundingbox: ['-1.3925000', '-1.2925000', '36.7766000', '36.9266000']
  }
];

/* A result with no name, where the label has to come from display_name. */
export const searchNoName = [
  {
    place_id: 12345,
    lat: '51.5073219',
    lon: '-0.1276474',
    display_name: 'Westminster, London, Greater London, England, SW1A 2DU, United Kingdom',
    boundingbox: ['51.5000000', '51.5200000', '-0.1400000', '-0.1100000']
  }
];

export const searchMalformed = [
  { place_id: 1, name: 'No coordinates', display_name: 'No coordinates' },
  { place_id: 2, lat: 'not-a-number', lon: '36.8', name: 'Bad lat', display_name: 'Bad lat' },
  { place_id: 3, lat: '-1.29', lon: '36.82', name: '', display_name: '' },
  null,
  'a string',
  {
    place_id: 4,
    lat: '-1.29',
    lon: '36.82',
    name: 'Good one',
    display_name: 'Good one, Nairobi',
    boundingbox: ['bad', 'bounds', 'here', 'too']
  }
];

/* Reverse: a road with a suburb, which should produce "road, area". */
export const reverseRoad = {
  place_id: 111,
  lat: '-1.2921',
  lon: '36.8219',
  display_name: 'Kenyatta Avenue, Central Business District, Nairobi, 00100, Kenya',
  address: {
    road: 'Kenyatta Avenue',
    suburb: 'Central Business District',
    city: 'Nairobi',
    postcode: '00100',
    country: 'Kenya',
    country_code: 'ke'
  }
};

/* A named feature: the name wins outright. */
export const reverseNamed = {
  place_id: 222,
  lat: '-1.2864',
  lon: '36.8172',
  name: 'Uhuru Park',
  display_name: 'Uhuru Park, Nairobi, Kenya',
  address: {
    leisure: 'Uhuru Park',
    road: 'Kenyatta Avenue',
    city: 'Nairobi',
    country: 'Kenya'
  }
};

/* No road at all, so the most specific area part is the answer. */
export const reverseAreaOnly = {
  place_id: 333,
  lat: '-0.5',
  lon: '37.5',
  display_name: 'Kirinyaga, Central Kenya, Kenya',
  address: {
    county: 'Kirinyaga',
    state: 'Central Kenya',
    country: 'Kenya'
  }
};

/* Out at sea: Nominatim returns an error object rather than a place. */
export const reverseNothing = {
  error: 'Unable to geocode'
};
