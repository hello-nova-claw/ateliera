import type { StoredStudioPreferences } from '@studio/application';

/**
 * Which ambient rhythm layers are shown. These are display switches, not data:
 * turning a layer off hides it everywhere but never deletes the underlying rhythm
 * profile. Every layer defaults on, so an untouched Studio keeps today's behaviour.
 */
export interface RhythmLayers {
  moon: boolean;
  microSeason: boolean;
  cycle: boolean;
}

export const DEFAULT_RHYTHM_LAYERS: RhythmLayers = {
  moon: true,
  microSeason: true,
  cycle: true,
};

export function resolveRhythmLayers(
  preferences: StoredStudioPreferences | null | undefined,
): RhythmLayers {
  const rhythm = preferences?.rhythm;
  return {
    moon: rhythm?.moon ?? DEFAULT_RHYTHM_LAYERS.moon,
    microSeason: rhythm?.microSeason ?? DEFAULT_RHYTHM_LAYERS.microSeason,
    cycle: rhythm?.cycle ?? DEFAULT_RHYTHM_LAYERS.cycle,
  };
}
