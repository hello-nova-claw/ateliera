import type { Almanac, RhythmOrientation } from './use-almanac';
import './TodaysAlmanac.css';

export interface TodaysAlmanacProps {
  almanac?: Almanac | null;
}

const ORIENTATION_COPY: Record<RhythmOrientation, string> = {
  inward: 'A gathering day — a good time to notice how far you have come.',
  outward: 'An opening day — a good time to name what you want to make room for.',
};

function sentenceCase(value: string): string {
  const spaced = value.replace(/-/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function TodaysAlmanac({ almanac }: TodaysAlmanacProps) {
  if (almanac === null || almanac === undefined) return null;
  const { moonPhase, illumination, season, microSeason, cycle, orientation } =
    almanac;
  return (
    <section className="foyer-almanac" aria-labelledby="foyer-almanac-title">
      <p className="foyer-section-label">Today's rhythm</p>
      <h2 id="foyer-almanac-title" className="foyer-almanac__term">
        {microSeason.term}
      </h2>
      <p className="foyer-almanac__gloss">{microSeason.gloss}</p>
      <p className="foyer-almanac__orientation">{ORIENTATION_COPY[orientation]}</p>
      <dl className="foyer-almanac__facts">
        <div className="foyer-almanac__fact">
          <dt>Season</dt>
          <dd>{sentenceCase(season)}</dd>
        </div>
        <div className="foyer-almanac__fact">
          <dt>Moon</dt>
          <dd>
            {sentenceCase(moonPhase)} · {Math.round(illumination * 100)}% lit
          </dd>
        </div>
        {cycle && (
          <div className="foyer-almanac__fact">
            <dt>Cycle</dt>
            <dd>
              Day {cycle.day} · {sentenceCase(cycle.phase)}
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}
