import type { Almanac } from './use-almanac';
import './TodaysAlmanac.css';

export interface TodaysAlmanacProps {
  almanac?: Almanac | null;
}

function sentenceCase(value: string): string {
  const spaced = value.replace(/-/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function TodaysAlmanac({ almanac }: TodaysAlmanacProps) {
  if (almanac === null || almanac === undefined) return null;
  const { moonPhase, illumination, season, microSeason } = almanac;
  return (
    <section className="foyer-almanac" aria-labelledby="foyer-almanac-title">
      <p className="foyer-section-label">Today's rhythm</p>
      <h2 id="foyer-almanac-title" className="foyer-almanac__term">
        {microSeason.term}
      </h2>
      <p className="foyer-almanac__gloss">{microSeason.gloss}</p>
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
      </dl>
    </section>
  );
}
