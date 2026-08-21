import type { Hemisphere } from './types';

/**
 * A birthplace the picker can offer. Coordinates, timezone, and hemisphere are
 * all derived from the choice, so a person only ever types a place name — never
 * a latitude they don't know.
 */
export interface Place {
  name: string;
  /** ISO 3166-1 alpha-2 country code, e.g. 'NZ'. */
  country: string;
  lat: number;
  lon: number;
  timeZone: string;
  hemisphere: Hemisphere;
}

// The generated gazetteer is loaded once, lazily, on the first search — it's a
// ~6.5 MB module (~2.3 MB gzipped) and must never enter the startup bundle.
let cache: Place[] | null = null;

async function loadPlaces(): Promise<Place[]> {
  if (cache !== null) return cache;
  const data = await import('./places-data.js');
  const places: Place[] = [];
  for (const row of data.default.split('\n')) {
    if (row === '') continue;
    const [name, country, lat, lon, timeZone] = row.split('\t');
    if (name === undefined || country === undefined || timeZone === undefined) continue;
    const latitude = Number(lat);
    places.push({
      name,
      country,
      lat: latitude,
      lon: Number(lon),
      timeZone,
      hemisphere: latitude < 0 ? 'S' : 'N',
    });
  }
  cache = places;
  return places;
}

/**
 * Offline birthplace search over the bundled gazetteer. Returns up to `limit`
 * matches, prefix matches first, then mid-string matches, each already in
 * descending population order (the dataset is pre-sorted). Case-insensitive.
 * An empty query returns nothing.
 */
export async function searchPlaces(query: string, limit = 20): Promise<Place[]> {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [];
  const places = await loadPlaces();
  const prefix: Place[] = [];
  const contains: Place[] = [];
  for (const place of places) {
    const name = place.name.toLowerCase();
    if (name.startsWith(needle)) {
      prefix.push(place);
      if (prefix.length >= limit) break;
    } else if (name.includes(needle)) {
      contains.push(place);
    }
  }
  return [...prefix, ...contains].slice(0, limit);
}
