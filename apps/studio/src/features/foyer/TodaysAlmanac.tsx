import almanac from '../../content/almanac.json';
import { DEFAULT_RHYTHM_LAYERS, type RhythmLayers } from '../settings/rhythm-layers';
import type { Almanac, RhythmOrientation } from './use-almanac';
import './TodaysAlmanac.css';

export interface TodaysAlmanacProps {
  almanac?: Almanac | null;
  layers?: RhythmLayers;
}

const ORIENTATION_COPY: Record<RhythmOrientation, string> = almanac.orientation;

function sentenceCase(value: string): string {
  const spaced = value.replace(/-/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function TodaysAlmanac({
  almanac,
  layers = DEFAULT_RHYTHM_LAYERS,
}: TodaysAlmanacProps) {
  if (almanac === null || almanac === undefined) return null;
  const { moonPhase, illumination, season, microSeason, cycle, orientation } =
    almanac;
  const showSeason = layers.microSeason;
  const showMoon = layers.moon;
  const showCycle = layers.cycle && cycle !== undefined;
  if (!showSeason && !showMoon && !showCycle) return null;
  return (
    <section className="foyer-almanac" aria-labelledby="foyer-almanac-title">
      {showSeason && <p className="foyer-section-label">Today's rhythm</p>}
      <h2 id="foyer-almanac-title" className="foyer-almanac__term">
        {showSeason ? microSeason.term : "Today's rhythm"}
      </h2>
      {showSeason && <p className="foyer-almanac__gloss">{microSeason.gloss}</p>}
      <p className="foyer-almanac__orientation">{ORIENTATION_COPY[orientation]}</p>
      <dl className="foyer-almanac__facts">
        {showSeason && (
          <div className="foyer-almanac__fact">
            <dt>Season</dt>
            <dd>{sentenceCase(season)}</dd>
          </div>
        )}
        {showMoon && (
          <div className="foyer-almanac__fact">
            <dt>Moon</dt>
            <dd>
              {sentenceCase(moonPhase)} · {Math.round(illumination * 100)}% lit
            </dd>
          </div>
        )}
        {showCycle && (
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
