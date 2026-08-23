import { useEffect, useMemo, useState } from 'react';
import type { StudioService } from '@studio/application';
import {
  computeRhythmContext,
  preferredKinds,
  type CycleProfile,
  type CycleState,
  type Hemisphere,
  type MicroSeason,
  type MoonPhase,
  type Season,
} from '@studio/rhythm';

/** Whether today's rhythm leans toward gathering (inward) or opening (outward). */
export type RhythmOrientation = 'inward' | 'outward';

/**
 * The ambient rhythm of today — the moon, the turning year, the micro-season,
 * the body's cycle, and the orientation those signals compose into. Moon and
 * felt season need no profile, so the almanac shows for everyone; a saved
 * profile refines the hemisphere and adds the cycle.
 */
export interface Almanac {
  moonPhase: MoonPhase;
  illumination: number;
  season: Season;
  microSeason: MicroSeason;
  cycle?: CycleState;
  orientation: RhythmOrientation;
}

interface ProfileBasis {
  hemisphere: Hemisphere;
  cycle?: CycleProfile;
}

export function useAlmanac(
  service: StudioService | undefined,
  today: string,
): Almanac {
  // Default to the northern hemisphere with no cycle; both refine once a
  // profile loads. Moon, season, and orientation still render meanwhile.
  const [basis, setBasis] = useState<ProfileBasis>({ hemisphere: 'N' });

  useEffect(() => {
    if (service === undefined) return undefined;
    let current = true;
    void (async () => {
      try {
        const snapshot = await service.rhythmProfile.load();
        if (current && snapshot.profile !== null) {
          setBasis({
            hemisphere: snapshot.profile.hemisphere,
            ...(snapshot.profile.cycle ? { cycle: snapshot.profile.cycle } : {}),
          });
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
      {
        location: { hemisphere: basis.hemisphere },
        cycle: basis.cycle,
        natal: { placements: {} },
      },
      today,
    );
    // The rhythm engine's own preferred-kind ranking already encodes the
    // inward/outward lean (evidence/reframe close inward; wish/dream open
    // outward); we read its top choice rather than re-deriving the weighting.
    const topKind = preferredKinds(ctx)[0];
    const orientation: RhythmOrientation =
      topKind === 'wish' || topKind === 'dream' ? 'outward' : 'inward';
    return {
      moonPhase: ctx.moon.phase,
      illumination: ctx.moon.illumination,
      season: ctx.season,
      microSeason: ctx.microSeason,
      ...(ctx.cycle ? { cycle: ctx.cycle } : {}),
      orientation,
    };
  }, [basis, today]);
}
