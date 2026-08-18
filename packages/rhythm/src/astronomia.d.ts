// Minimal type declarations for the astronomia package (it ships no types).
// These cover only the subset used by natal-chart.ts.

declare module 'astronomia/julian' {
  export function CalendarGregorianToJD(y: number, m: number, d: number): number;
}

declare module 'astronomia/solar' {
  /** T = Julian centuries since J2000. Returns ecliptic longitude in radians. */
  export function apparentLongitude(T: number): number;
}

declare module 'astronomia/moonposition' {
  interface Coord {
    /** Right ascension in radians. */
    readonly ra: number;
    /** Declination in radians. */
    readonly dec: number;
    readonly range: number;
  }
  /** Takes JDE (Julian Ephemeris Day = JD for our purposes). */
  export function position(jde: number): Coord;
}

declare module 'astronomia/sidereal' {
  /** Apparent sidereal time at Greenwich, in seconds of time. */
  export function apparent(jd: number): number;
}

declare module 'astronomia/coord' {
  export class Ecliptic {
    constructor(lon: number, lat: number);
    lon: number;
    lat: number;
  }
  export class Equatorial {
    constructor(ra: number, dec: number);
    ra: number;
    dec: number;
    toEcliptic(eps: number): Ecliptic;
  }
}
