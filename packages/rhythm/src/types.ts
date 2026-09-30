export type MoonPhase =
  | 'new'
  | 'waxing-crescent'
  | 'first-quarter'
  | 'waxing-gibbous'
  | 'full'
  | 'waning-gibbous'
  | 'last-quarter'
  | 'waning-crescent';

export type Season = 'winter' | 'spring' | 'summer' | 'autumn';

/**
 * The lunar month as a season in its own right, mirroring the year: `new` (rest,
 * the seed in the dark), `waxing` (building), `full` (peak), `waning` (release).
 */
export type LunarSeason = 'new' | 'waxing' | 'full' | 'waning';

export type Hemisphere = 'N' | 'S';

export type CyclePhase = 'menstrual' | 'follicular' | 'ovulation' | 'luteal';

export interface MicroSeason {
  term: string;
  gloss: string;
}

export interface MoonState {
  phase: MoonPhase;
  illumination: number;
}

export interface CycleState {
  phase: CyclePhase;
  day: number;
}

export interface CycleProfile {
  /** ISO `YYYY-MM-DD` of the most recent period start. */
  lastPeriodStart: string;
  avgLengthDays: number;
}

/**
 * The only inputs the rhythm engine needs. Deliberately narrower than a host
 * application's user profile: no vault path, no identity, no storage handle,
 * so this package stays portable across hosts.
 */
export interface RhythmProfile {
  location: { hemisphere: Hemisphere };
  cycle?: CycleProfile | undefined;
  natal: { placements: Record<string, string> };
}

export interface RhythmContext {
  date: string;
  season: Season;
  microSeason: MicroSeason;
  moon: MoonState;
  /** The moon-phase season (new/waxing/full/waning) for the day. */
  lunarSeason: LunarSeason;
  /** Fraction through the synodic month from the new moon (0 at new, 0.5 at full). */
  lunarProgress: number;
  cycle?: CycleState | undefined;
  placements: Record<string, string>;
}

export interface NatalChart {
  sun: string;
  moon: string;
  /** null when birth time (and therefore the ascendant) is unknown — never fabricated. */
  rising: string | null;
  placements: Record<string, string>;
}

export type ResurfaceKind = 'evidence' | 'reframe' | 'wish' | 'dream';

export interface ResurfaceCard {
  /** Opaque, stable identifier for the source entry. Used only for deterministic tie-breaking. */
  sourcePath: string;
  kind: ResurfaceKind;
  /** ISO `YYYY-MM-DD`. */
  dueDate: string;
  intervalDays: number;
}
