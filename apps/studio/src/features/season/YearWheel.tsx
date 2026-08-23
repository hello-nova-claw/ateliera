import type { MicroSeason, Season } from '@studio/rhythm';
import './YearWheel.css';

export interface YearWheelProps {
  season: Season;
  microSeason: MicroSeason;
}

function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * The ambient astronomical year — where the turning wheel of the seasons sits
 * today — shown alongside the person's own authored Current Season. Named "the
 * turning year", never "season", so it can never be mistaken for the room's
 * user-chosen season.
 */
export function YearWheel({ season, microSeason }: YearWheelProps) {
  return (
    <section
      aria-labelledby="season-year-wheel-title"
      className="season-year-wheel"
    >
      <p className="season-page__label">The turning year</p>
      <h2 id="season-year-wheel-title" className="season-year-wheel__term">
        {microSeason.term}
      </h2>
      <p className="season-year-wheel__gloss">{microSeason.gloss}</p>
      <p className="season-year-wheel__season">
        The wheel stands in {sentenceCase(season)}.
      </p>
    </section>
  );
}
