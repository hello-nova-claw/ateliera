import type {
  CyclePhase,
  CycleProfile,
  CycleState,
  Hemisphere,
  LunarSeason,
  MicroSeason,
  MoonPhase,
  MoonState,
  RhythmContext,
  RhythmProfile,
  Season,
} from './types';
import microSeasonTable from './content/micro-seasons.json';

function parseDateUTC(date: string): { year: number; month: number; day: number; ms: number } {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return { year, month, day, ms: Date.UTC(year, month - 1, day) };
}

const FLIP: Record<Season, Season> = {
  winter: 'summer',
  summer: 'winter',
  spring: 'autumn',
  autumn: 'spring',
};

export function resolveSeason(month: number, hemisphere: Hemisphere): Season {
  let northern: Season;
  if (month === 12 || month <= 2) northern = 'winter';
  else if (month <= 5) northern = 'spring';
  else if (month <= 8) northern = 'summer';
  else northern = 'autumn';
  return hemisphere === 'S' ? FLIP[northern] : northern;
}

const MOON_PHASES: readonly MoonPhase[] = [
  'new',
  'waxing-crescent',
  'first-quarter',
  'waxing-gibbous',
  'full',
  'waning-gibbous',
  'last-quarter',
  'waning-crescent',
];

const DEG = Math.PI / 180;
const sinDeg = (deg: number): number => Math.sin(deg * DEG);
const cosDeg = (deg: number): number => Math.cos(deg * DEG);
const mod360 = (deg: number): number => ((deg % 360) + 360) % 360;

/**
 * Sun–Moon elongation on 0 (new) … 180 (full) … 360 and the illuminated
 * fraction for an instant, from Meeus' *Astronomical Algorithms* (ch. 47–48).
 * The single source both the eight-phase name and the four lunar seasons read,
 * so they can never disagree. `dateMs` is a Unix millisecond time.
 */
function moonAngles(dateMs: number): { elongation: number; illumination: number } {
  const jd = dateMs / 86400000 + 2440587.5;
  const t = (jd - 2451545.0) / 36525;
  // Mean elongation of the Moon, Sun's mean anomaly, Moon's mean anomaly (deg).
  const d =
    297.8501921 +
    445267.1114034 * t -
    0.0018819 * t * t +
    (t * t * t) / 545868 -
    (t * t * t * t) / 113065000;
  const m =
    357.5291092 + 35999.0502909 * t - 0.0001536 * t * t + (t * t * t) / 24490000;
  const mPrime =
    134.9633964 +
    477198.8675055 * t +
    0.0087414 * t * t +
    (t * t * t) / 69699 -
    (t * t * t * t) / 14712000;
  // Phase angle (Sun–Moon–Earth), Meeus 48.4.
  const phaseAngle =
    180 -
    d -
    6.289 * sinDeg(mPrime) +
    2.1 * sinDeg(m) -
    1.274 * sinDeg(2 * d - mPrime) -
    0.658 * sinDeg(2 * d) -
    0.214 * sinDeg(2 * mPrime) -
    0.11 * sinDeg(d);
  const illumination = (1 + cosDeg(phaseAngle)) / 2;
  // Fold the phase angle to [0, 180] and pair it with the waxing/waning sign
  // (mean elongation < 180° ⇒ waxing) to get an elongation on 0 (new) … 180
  // (full) … 360.
  const waxing = mod360(d) < 180;
  const folded = mod360(phaseAngle) > 180 ? 360 - mod360(phaseAngle) : mod360(phaseAngle);
  const elongation = mod360(waxing ? 180 - folded : 180 + folded);
  return { elongation, illumination };
}

/**
 * Moon phase and illuminated fraction for an instant. Bins the elongation into
 * eight phases 45° wide, centred on their marks. `dateMs` is a Unix ms time.
 */
export function computeMoon(dateMs: number): MoonState {
  const { elongation, illumination } = moonAngles(dateMs);
  const index = Math.floor(mod360(elongation + 22.5) / 45) % 8;
  return { phase: MOON_PHASES[index]!, illumination };
}

/**
 * The moon-phase season and the fraction through the synodic month (0 at new,
 * 0.5 at full). Four 90°-wide seasons centred on new/first-quarter/full/last-
 * quarter, so the "new" and "full" windows straddle their exact instants.
 */
export function computeLunarSeason(dateMs: number): { season: LunarSeason; progress: number } {
  const { elongation } = moonAngles(dateMs);
  let season: LunarSeason;
  if (elongation < 45 || elongation >= 315) season = 'new';
  else if (elongation < 135) season = 'waxing';
  else if (elongation < 225) season = 'full';
  else season = 'waning';
  return { season, progress: elongation / 360 };
}

// 24 micro-seasons keyed by their approximate Gregorian start (month, day), each
// with a short observation. Original Ateliera language — inspired by the *form* of
// nature-almanac micro-seasons (the year cut into small, felt turns), not by any
// tradition's names or content. Northern-hemisphere calendar; the southern
// hemisphere reads this table shifted by six months so the felt season matches.
interface MicroSeasonTerm {
  month: number;
  day: number;
  term: string;
  gloss: string;
}

// The table itself is content, kept in ./content/micro-seasons.json (shared verbatim
// with the native app's apple/Ateliera/Content/micro-seasons.json).
const MICRO_SEASONS: readonly MicroSeasonTerm[] = microSeasonTable;

const CUMULATIVE_DAYS: readonly number[] = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

function dayOfYearNoLeap(month: number, day: number): number {
  return CUMULATIVE_DAYS[month - 1]! + day;
}

export function resolveMicroSeason(month: number, day: number, hemisphere: Hemisphere): MicroSeason {
  // Southern hemisphere: shift the lookup date by six months so the felt
  // season matches (a June date in the south reads the table's December term).
  let lookupMonth = month;
  if (hemisphere === 'S') {
    lookupMonth = ((month - 1 + 6) % 12) + 1;
  }
  const target = dayOfYearNoLeap(lookupMonth, day);

  // Find the latest term whose start day-of-year is <= target; wrap to the final
  // term (The Long Night) for dates before the first term of the year.
  let chosen = MICRO_SEASONS[MICRO_SEASONS.length - 1]!;
  for (const t of MICRO_SEASONS) {
    if (dayOfYearNoLeap(t.month, t.day) <= target) chosen = t;
  }
  return { term: chosen.term, gloss: chosen.gloss };
}

function cyclePhaseForDay(day: number, avgLengthDays: number): CyclePhase {
  if (day <= 5) return 'menstrual';
  const ovulationStart = Math.max(6, avgLengthDays - 14); // 28 -> day 14
  if (day < ovulationStart) return 'follicular';
  if (day <= ovulationStart + 2) return 'ovulation'; // 28 -> days 14..16
  return 'luteal';
}

export function computeCycle(
  cycle: CycleProfile | undefined,
  dateMs: number,
): CycleState | undefined {
  if (!cycle) return undefined;
  const startMs = Date.UTC(
    Number(cycle.lastPeriodStart.slice(0, 4)),
    Number(cycle.lastPeriodStart.slice(5, 7)) - 1,
    Number(cycle.lastPeriodStart.slice(8, 10)),
  );
  const daysSince = Math.floor((dateMs - startMs) / 86400000);
  const avg = cycle.avgLengthDays;
  // Within the first cycle, day counts from the start day as day 1.
  // Once a full average-length cycle has elapsed, the day wraps:
  // daysSince mod avg gives the day in the recomputed current cycle
  // (e.g. 40 days, avg 28 -> 12).
  const day = daysSince < avg ? daysSince + 1 : daysSince % avg || avg;
  return { day, phase: cyclePhaseForDay(day, avg) };
}

export function computeRhythmContext(profile: RhythmProfile, date: string): RhythmContext {
  const { month, day, ms } = parseDateUTC(date);
  const lunar = computeLunarSeason(ms);
  return {
    date,
    season: resolveSeason(month, profile.location.hemisphere),
    microSeason: resolveMicroSeason(month, day, profile.location.hemisphere),
    moon: computeMoon(ms),
    lunarSeason: lunar.season,
    lunarProgress: lunar.progress,
    cycle: computeCycle(profile.cycle, ms),
    placements: profile.natal.placements,
  };
}
