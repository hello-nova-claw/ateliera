import './SeasonTimeline.css';

export interface SeasonTimelineItem {
  id: string;
  name: string;
  /** The season's guiding theme, shown in italic. */
  theme: string;
  dateRange: string;
  thumbSrc?: string;
}

export interface SeasonTimelineProps {
  seasons: SeasonTimelineItem[];
  currentId: string;
  onSelect?: (id: string) => void;
}

export function SeasonTimeline({
  seasons,
  currentId,
  onSelect,
}: SeasonTimelineProps) {
  return (
    <ol className="studio-season-timeline">
      {seasons.map((season) => {
        const current = season.id === currentId;
        const label = `${season.name}, ${season.theme}, ${season.dateRange}`;
        return (
          <li
            className="studio-season-timeline__item"
            key={season.id}
            {...(current ? { 'aria-current': 'true' } : {})}
          >
            <button
              aria-label={label}
              className="studio-season-timeline__entry"
              onClick={onSelect ? () => onSelect(season.id) : undefined}
              type="button"
            >
              <span
                aria-hidden="true"
                className="studio-season-timeline__dot"
              />
              <span aria-hidden="true" className="studio-season-timeline__thumb">
                {season.thumbSrc ? <img alt="" src={season.thumbSrc} /> : null}
              </span>
              <span className="studio-season-timeline__text">
                <span className="studio-season-timeline__name">{season.name}</span>
                <span className="studio-season-timeline__theme">{season.theme}</span>
                <span className="studio-season-timeline__range">{season.dateRange}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
