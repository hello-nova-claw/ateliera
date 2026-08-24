import { VaultUnavailableError } from '@studio/storage/portable';
import type { VaultPort } from '@studio/storage/portable';

export const STUDIO_PREFERENCES_CONFIG_PATH = '.studio/config/studio-preferences.json';
const MAX_CONFIG_BYTES = 64 * 1024;

/**
 * Sparse user configuration: every field is optional, and an absent key means
 * "use the default" resolved higher up (see the settings feature). This keeps the
 * application layer free of the UI's room/section identifiers — values are validated
 * structurally, not against a fixed vocabulary — so new rooms need no repository change.
 */
export interface StoredStudioPreferences {
  rooms?: Record<string, 'on' | 'off'>;
  foyerSections?: Record<string, 'on' | 'off'>;
  rhythm?: { moon?: boolean; microSeason?: boolean; cycle?: boolean };
  reveals?: Record<string, 'accepted' | 'dismissed'>;
}

export interface StudioPreferencesSnapshot {
  preferences: StoredStudioPreferences; // {} = nothing saved yet, i.e. all defaults
  revision: string | null;
  repairRequired: boolean;
}

export interface StudioPreferencesRepository {
  load(): Promise<StudioPreferencesSnapshot>;
  save(
    preferences: StoredStudioPreferences,
    expectedRevision: string | null,
  ): Promise<StudioPreferencesSnapshot>;
}

export class UnsupportedStudioPreferencesConfigError extends Error {
  override readonly name = 'UnsupportedStudioPreferencesConfigError';

  constructor(readonly version: number) {
    super(`Studio preferences use newer version ${version}.`);
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

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeToggleMap<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): Record<string, T> | undefined {
  if (value === undefined) return undefined;
  if (!isPlainRecord(value)) throw new Error(`Studio preferences ${label} must be a record.`);
  const entries = Object.entries(value);
  for (const [key, state] of entries) {
    if (key === '' || typeof state !== 'string' || !allowed.includes(state as T))
      throw new Error(`Studio preferences ${label} has an invalid entry.`);
  }
  return Object.fromEntries(entries) as Record<string, T>;
}

function normalizeRhythm(value: unknown): StoredStudioPreferences['rhythm'] {
  if (value === undefined) return undefined;
  if (!isPlainRecord(value) || !hasOnlyKeys(value, ['cycle', 'microSeason', 'moon']))
    throw new Error('Studio preferences rhythm is invalid.');
  const rhythm: NonNullable<StoredStudioPreferences['rhythm']> = {};
  for (const key of ['cycle', 'microSeason', 'moon'] as const) {
    const flag = value[key];
    if (flag === undefined) continue;
    if (typeof flag !== 'boolean')
      throw new Error('Studio preferences rhythm flags must be booleans.');
    rhythm[key] = flag;
  }
  return rhythm;
}

function normalize(value: unknown): StoredStudioPreferences {
  if (
    !isPlainRecord(value) ||
    !hasOnlyKeys(value, ['foyerSections', 'reveals', 'rhythm', 'rooms'])
  )
    throw new Error('Studio preferences are invalid.');
  const preferences: StoredStudioPreferences = {};
  const rooms = normalizeToggleMap(value.rooms, ['off', 'on'] as const, 'rooms');
  if (rooms !== undefined) preferences.rooms = rooms;
  const foyerSections = normalizeToggleMap(
    value.foyerSections,
    ['off', 'on'] as const,
    'foyerSections',
  );
  if (foyerSections !== undefined) preferences.foyerSections = foyerSections;
  const rhythm = normalizeRhythm(value.rhythm);
  if (rhythm !== undefined) preferences.rhythm = rhythm;
  const reveals = normalizeToggleMap(
    value.reveals,
    ['accepted', 'dismissed'] as const,
    'reveals',
  );
  if (reveals !== undefined) preferences.reveals = reveals;
  return preferences;
}

function parse(text: string): StoredStudioPreferences | undefined {
  if (new TextEncoder().encode(text).byteLength > MAX_CONFIG_BYTES) return undefined;
  let stored: unknown;
  try {
    stored = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (
    isPlainRecord(stored) &&
    typeof stored.version === 'number' &&
    stored.version > 1
  )
    throw new UnsupportedStudioPreferencesConfigError(stored.version);
  try {
    if (
      !isPlainRecord(stored) ||
      !hasExactKeys(stored, ['preferences', 'version']) ||
      stored.version !== 1
    )
      return undefined;
    return normalize(stored.preferences);
  } catch {
    return undefined;
  }
}

export function createStudioPreferencesRepository(
  vault: VaultPort,
): StudioPreferencesRepository {
  return {
    async load() {
      try {
        const current = await vault.readText(STUDIO_PREFERENCES_CONFIG_PATH);
        const preferences = parse(current.text);
        return preferences === undefined
          ? { preferences: {}, revision: current.hash, repairRequired: true }
          : { preferences, revision: current.hash, repairRequired: false };
      } catch (error) {
        if (!(error instanceof VaultUnavailableError)) throw error;
        if (await vault.exists(STUDIO_PREFERENCES_CONFIG_PATH)) throw error;
        return { preferences: {}, revision: null, repairRequired: false };
      }
    },
    async save(preferences, expectedRevision) {
      const normalized = normalize(preferences);
      const saved = await vault.writeTextAtomic(
        STUDIO_PREFERENCES_CONFIG_PATH,
        `${JSON.stringify({ version: 1, preferences: normalized }, null, 2)}\n`,
        expectedRevision === null
          ? { expectedMissing: true }
          : { expectedHash: expectedRevision },
      );
      return {
        preferences: normalized,
        revision: saved.hash,
        repairRequired: false,
      };
    },
  };
}
