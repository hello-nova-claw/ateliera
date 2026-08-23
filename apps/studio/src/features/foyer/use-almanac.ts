import { useEffect, useMemo, useState } from 'react';
import type { StudioService } from '@studio/application';
import {
  computeRhythmContext,
  type Hemisphere,
  type MicroSeason,
  type MoonPhase,
  type Season,
} from '@studio/rhythm';

/**
 * The ambient rhythm of today — the moon, the turning year, the micro-season.
 * Unlike the Gift, this needs no natal profile: the moon and the felt season
 * are shared, not personal, so the almanac shows for everyone. A saved profile
 * only refines the felt season to the right hemisphere.
 */
export interface Almanac {
  moonPhase: MoonPhase;
  illumination: number;
  season: Season;
  microSeason: MicroSeason;
}

export function useAlmanac(
  service: StudioService | undefined,
  today: string,
): Almanac {
  // Default to the northern hemisphere; the year-wheel flips once a profile
  // with a hemisphere is loaded. Moon and micro-season still render meanwhile.
  const [hemisphere, setHemisphere] = useState<Hemisphere>('N');

  useEffect(() => {
    if (service === undefined) return undefined;
    let current = true;
    void (async () => {
      try {
        const snapshot = await service.rhythmProfile.load();
        if (current && snapshot.profile !== null) {
          setHemisphere(snapshot.profile.hemisphere);
        }
      } catch {
        // A broken profile read leaves the almanac on its northern default
        // rather than hiding it — the moon and year turn regardless.
      }
    })();
    return () => {
      current = false;
    };
  }, [service]);

  return useMemo(() => {
    const ctx = computeRhythmContext(
      { location: { hemisphere }, natal: { placements: {} } },
      today,
    );
    return {
      moonPhase: ctx.moon.phase,
      illumination: ctx.moon.illumination,
      season: ctx.season,
      microSeason: ctx.microSeason,
    };
  }, [hemisphere, today]);
}
