import { useEffect, useState } from 'react';
import type { StudioService } from '@studio/application';
import { computeMoon, type MoonPhase } from '@studio/rhythm';
import { MoonPhaseIcon } from '@studio/ui';
import './MoonGuide.css';

const WAXING_PHASES: ReadonlySet<MoonPhase> = new Set([
  'waxing-crescent',
  'first-quarter',
  'waxing-gibbous',
]);

function phaseLabel(phase: MoonPhase): string {
  const spaced = phase.replace(/-/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function todayLocalISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export interface MoonGuideProps {
  service?: StudioService;
  /** ISO `YYYY-MM-DD`; defaults to today. Injected in tests for determinism. */
  today?: string;
}

export function MoonGuide({ service, today = todayLocalISO() }: MoonGuideProps) {
  // The moon phase is shared, not personal — only the lit limb flips by
  // hemisphere. Default north; refine once a profile with a hemisphere loads.
  const [hemisphere, setHemisphere] = useState<'N' | 'S'>('N');

  useEffect(() => {
    if (service === undefined) return undefined;
    let live = true;
    void (async () => {
      try {
        const snapshot = await service.rhythmProfile.load();
        if (live && snapshot.profile !== null) {
          setHemisphere(snapshot.profile.hemisphere);
        }
      } catch {
        // Keep the northern default; the moon still draws.
      }
    })();
    return () => {
      live = false;
    };
  }, [service]);

  const ms = Date.UTC(
    Number(today.slice(0, 4)),
    Number(today.slice(5, 7)) - 1,
    Number(today.slice(8, 10)),
  );
  const { phase, illumination } = computeMoon(ms);
  const percent = Math.round(illumination * 100);
  const waxesRight = WAXING_PHASES.has(phase);
  const litRight = hemisphere === 'S' ? !waxesRight : waxesRight;
  const label = phaseLabel(phase);

  return (
    <div className="studio-moon-guide">
      <MoonPhaseIcon
        illumination={illumination}
        label={`${label}, ${percent}% lit`}
        litSide={litRight ? 'right' : 'left'}
        size={26}
      />
      <span className="studio-moon-guide__text">
        <span className="studio-moon-guide__phase">{label}</span>
        <span className="studio-moon-guide__meta">{percent}% lit</span>
      </span>
    </div>
  );
}
