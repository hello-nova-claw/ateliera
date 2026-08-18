/**
 * On-device natal-chart computation.
 *
 * No platform APIs and no network. The ephemeris library (astronomia) is
 * imported LAZILY so it never enters a host's first-load bundle and only loads
 * when a chart is actually computed.
 *
 * Honest degradation, never fabrication:
 *   - no date             → empty chart
 *   - date only           → sun only
 *   - date + time         → sun + moon
 *   - date + time + loc.  → sun + moon + rising
 */

// This package has no `references`-based project graph (every workspace
// project type-checks by re-parsing raw source it imports, not compiled
// declaration output), so the ambient `astronomia/*` module declarations
// only enter a consumer's TS program if this file explicitly pulls them
// in — a directory `include` glob elsewhere (e.g. a host app's tsconfig)
// won't reach a sibling .d.ts it never imports.
import './astronomia.d.ts';
import type { NatalChart } from './types';
import { localToUTC } from './timezone';

const ZODIAC = [
  'Aries',
  'Taurus',
  'Gemini',
  'Cancer',
  'Leo',
  'Virgo',
  'Libra',
  'Scorpio',
  'Sagittarius',
  'Capricorn',
  'Aquarius',
  'Pisces',
] as const;

const EMPTY_CHART: NatalChart = { sun: '', moon: '', rising: null, placements: {} };

const TIME_RE = /^\d{2}:\d{2}$/u;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;

function norm360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function signFromLongitude(lonDeg: number): string {
  return ZODIAC[Math.floor(norm360(lonDeg) / 30) % 12]!;
}

function toUTCDate(birthDate: string, birthTimeUTC: string | null): Date | null {
  if (!DATE_RE.test(birthDate)) return null;
  const time = birthTimeUTC && TIME_RE.test(birthTimeUTC) ? birthTimeUTC : '00:00';
  const ms = Date.parse(`${birthDate}T${time}:00Z`);
  if (Number.isNaN(ms)) return null;
  return new Date(ms);
}

export async function computeNatalChart(
  birthDate: string,
  birthTimeUTC: string | null,
  birthLat: number | null,
  birthLon: number | null,
): Promise<NatalChart> {
  const when = toUTCDate(birthDate, birthTimeUTC);
  if (!when) return EMPTY_CHART;

  const [julian, solar, moonposition, sidereal, coord] = await Promise.all([
    import('astronomia/julian'),
    import('astronomia/solar'),
    import('astronomia/moonposition'),
    import('astronomia/sidereal'),
    import('astronomia/coord'),
  ]);

  const dayFrac = (when.getUTCHours() * 3600 + when.getUTCMinutes() * 60) / 86400;
  const jd = julian.CalendarGregorianToJD(
    when.getUTCFullYear(),
    when.getUTCMonth() + 1,
    when.getUTCDate() + dayFrac,
  );

  const T = (jd - 2451545.0) / 36525;
  const sunLonRad = solar.apparentLongitude(T);
  const sun = signFromLongitude((sunLonRad * 180) / Math.PI);

  const placements: Record<string, string> = { sun };
  let moon = '';
  let rising: string | null = null;

  if (birthTimeUTC && TIME_RE.test(birthTimeUTC)) {
    const moonPos = moonposition.position(jd);
    // moonposition returns equatorial RA/Dec; convert to ecliptic longitude.
    const eps = ((23.4392911 - 0.013004167 * T) * Math.PI) / 180;
    const moonEcl = new coord.Equatorial(moonPos.ra, moonPos.dec).toEcliptic(eps);
    moon = signFromLongitude((moonEcl.lon * 180) / Math.PI);
    placements.moon = moon;

    if (typeof birthLat === 'number' && typeof birthLon === 'number') {
      // GAST from sidereal.apparent is in seconds of time [0, 86400).
      const gastHours = sidereal.apparent(jd) / 3600;
      const lstHours = gastHours + birthLon / 15;
      const ramcRad = (norm360(lstHours * 15) * Math.PI) / 180;
      const phi = (birthLat * Math.PI) / 180;
      const ascRad = Math.atan2(
        -Math.cos(ramcRad),
        Math.sin(ramcRad) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps),
      );
      rising = signFromLongitude((ascRad * 180) / Math.PI);
      placements.rising = rising;
    }
  }

  return { sun, moon, rising, placements };
}

/**
 * Compute the chart from a LOCAL birth time plus its IANA timezone, converting
 * to UTC on-device first. The caller never has to reason about UTC or the date
 * line. When the zone/time can't be resolved we pass no time through, so the
 * chart honestly degrades to sun-only rather than guessing the moon/rising.
 */
export async function computeNatalChartLocal(
  birthDate: string,
  birthTimeLocal: string | null,
  birthTimeZone: string | null,
  birthLat: number | null,
  birthLon: number | null,
): Promise<NatalChart> {
  const utc =
    birthTimeLocal && birthTimeZone ? localToUTC(birthDate, birthTimeLocal, birthTimeZone) : null;
  if (!utc) return computeNatalChart(birthDate, null, birthLat, birthLon);
  return computeNatalChart(utc.date, utc.time, birthLat, birthLon);
}
