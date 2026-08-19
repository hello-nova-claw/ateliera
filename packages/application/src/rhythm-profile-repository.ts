import { VaultUnavailableError } from '@studio/storage/portable';
import type { VaultPort } from '@studio/storage/portable';

export const RHYTHM_PROFILE_CONFIG_PATH = '.studio/config/rhythm-profile.json';
const MAX_CONFIG_BYTES = 64 * 1024;

export interface StoredRhythmProfile {
  hemisphere: 'N' | 'S';
  cycle?: { lastPeriodStart: string; avgLengthDays: number };
  birth: {
    date?: string;
    timeLocal?: string;
    timeZone?: string;
    lat?: number;
    lon?: number;
    place?: string;
  };
  natal: { placements: Record<string, string> };
}

export interface RhythmProfileSnapshot {
  profile: StoredRhythmProfile | null; // null = no profile saved yet, distinct from "saved but empty"
  revision: string | null;
  repairRequired: boolean;
}

export interface RhythmProfileRepository {
  load(): Promise<RhythmProfileSnapshot>;
  save(
    profile: StoredRhythmProfile,
    expectedRevision: string | null,
  ): Promise<RhythmProfileSnapshot>;
}

export class UnsupportedRhythmProfileConfigError extends Error {
  override readonly name = 'UnsupportedRhythmProfileConfigError';

  constructor(readonly version: number) {
    super(`Rhythm profile settings use newer version ${version}.`);
  }
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: string[]): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isOptionalNumber(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value));
}

function normalizeCycle(value: unknown): StoredRhythmProfile['cycle'] {
  if (value === undefined) return undefined;
  if (
    typeof value !== 'object' ||
    value === null ||
    !hasExactKeys(value as Record<string, unknown>, [
      'avgLengthDays',
      'lastPeriodStart',
    ])
  )
    throw new Error('A rhythm profile cycle entry is invalid.');
  const { avgLengthDays, lastPeriodStart } = value as {
    avgLengthDays?: unknown;
    lastPeriodStart?: unknown;
  };
  if (typeof lastPeriodStart !== 'string' || lastPeriodStart === '')
    throw new Error('Rhythm profile cycle needs a last period start date.');
  if (
    typeof avgLengthDays !== 'number' ||
    !Number.isFinite(avgLengthDays) ||
    avgLengthDays <= 0
  )
    throw new Error('Rhythm profile cycle length must be a positive number.');
  return { lastPeriodStart, avgLengthDays };
}

function normalizeBirth(value: unknown): StoredRhythmProfile['birth'] {
  if (
    typeof value !== 'object' ||
    value === null ||
    !hasOnlyKeys(value as Record<string, unknown>, [
      'date',
      'lat',
      'lon',
      'place',
      'timeLocal',
      'timeZone',
    ])
  )
    throw new Error('A rhythm profile birth entry is invalid.');
  const { date, lat, lon, place, timeLocal, timeZone } = value as {
    date?: unknown;
    lat?: unknown;
    lon?: unknown;
    place?: unknown;
    timeLocal?: unknown;
    timeZone?: unknown;
  };
  if (
    !isOptionalString(date) ||
    !isOptionalString(timeLocal) ||
    !isOptionalString(timeZone) ||
    !isOptionalString(place) ||
    !isOptionalNumber(lat) ||
    !isOptionalNumber(lon)
  )
    throw new Error('A rhythm profile birth entry is invalid.');
  const birth: StoredRhythmProfile['birth'] = {};
  if (date !== undefined) birth.date = date;
  if (timeLocal !== undefined) birth.timeLocal = timeLocal;
  if (timeZone !== undefined) birth.timeZone = timeZone;
  if (lat !== undefined) birth.lat = lat;
  if (lon !== undefined) birth.lon = lon;
  if (place !== undefined) birth.place = place;
  return birth;
}

function normalizeNatal(value: unknown): StoredRhythmProfile['natal'] {
  if (
    typeof value !== 'object' ||
    value === null ||
    !hasExactKeys(value as Record<string, unknown>, ['placements'])
  )
    throw new Error('A rhythm profile natal entry is invalid.');
  const { placements } = value as { placements?: unknown };
  if (typeof placements !== 'object' || placements === null || Array.isArray(placements))
    throw new Error('Rhythm profile natal placements must be a plain record.');
  const entries = Object.entries(placements as Record<string, unknown>);
  for (const [key, placement] of entries) {
    if (typeof key !== 'string' || key === '' || typeof placement !== 'string')
      throw new Error('Rhythm profile natal placements must map strings to strings.');
  }
  return { placements: Object.fromEntries(entries) as Record<string, string> };
}

function normalize(value: unknown): StoredRhythmProfile {
  if (
    typeof value !== 'object' ||
    value === null ||
    !hasOnlyKeys(value as Record<string, unknown>, [
      'birth',
      'cycle',
      'hemisphere',
      'natal',
    ])
  )
    throw new Error('A rhythm profile is invalid.');
  const { birth, cycle, hemisphere, natal } = value as {
    birth?: unknown;
    cycle?: unknown;
    hemisphere?: unknown;
    natal?: unknown;
  };
  if (hemisphere !== 'N' && hemisphere !== 'S')
    throw new Error("Rhythm profile hemisphere must be 'N' or 'S'.");
  const profile: StoredRhythmProfile = {
    hemisphere,
    birth: normalizeBirth(birth),
    natal: normalizeNatal(natal),
  };
  const normalizedCycle = normalizeCycle(cycle);
  if (normalizedCycle !== undefined) profile.cycle = normalizedCycle;
  return profile;
}

function parse(text: string): StoredRhythmProfile | null | undefined {
  if (new TextEncoder().encode(text).byteLength > MAX_CONFIG_BYTES) return undefined;
  let stored: unknown;
  try {
    stored = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (
    typeof stored === 'object' &&
    stored !== null &&
    typeof (stored as { version?: unknown }).version === 'number' &&
    (stored as { version: number }).version > 1
  )
    throw new UnsupportedRhythmProfileConfigError(
      (stored as { version: number }).version,
    );
  try {
    if (
      typeof stored !== 'object' ||
      stored === null ||
      !hasExactKeys(stored as Record<string, unknown>, ['profile', 'version']) ||
      (stored as { version?: unknown }).version !== 1
    )
      return undefined;
    const profile = (stored as { profile?: unknown }).profile;
    // `save()` never writes `profile: null` itself (it only accepts a non-nullable
    // StoredRhythmProfile), but the on-disk format allows it for type-consistency with
    // RhythmProfileSnapshot.profile — e.g. a future "clear profile" affordance, or a
    // hand-edited/test fixture that resets the file to the "no profile saved" state
    // without deleting it outright.
    return profile === null ? null : normalize(profile);
  } catch {
    return undefined;
  }
}

export function createRhythmProfileRepository(
  vault: VaultPort,
): RhythmProfileRepository {
  return {
    async load() {
      try {
        const current = await vault.readText(RHYTHM_PROFILE_CONFIG_PATH);
        const profile = parse(current.text);
        return profile === undefined
          ? { profile: null, revision: current.hash, repairRequired: true }
          : { profile, revision: current.hash, repairRequired: false };
      } catch (error) {
        if (!(error instanceof VaultUnavailableError)) throw error;
        if (await vault.exists(RHYTHM_PROFILE_CONFIG_PATH)) throw error;
        return { profile: null, revision: null, repairRequired: false };
      }
    },
    async save(profile, expectedRevision) {
      const normalized = normalize(profile);
      const saved = await vault.writeTextAtomic(
        RHYTHM_PROFILE_CONFIG_PATH,
        `${JSON.stringify({ version: 1, profile: normalized }, null, 2)}\n`,
        expectedRevision === null
          ? { expectedMissing: true }
          : { expectedHash: expectedRevision },
      );
      return {
        profile: normalized,
        revision: saved.hash,
        repairRequired: false,
      };
    },
  };
}
