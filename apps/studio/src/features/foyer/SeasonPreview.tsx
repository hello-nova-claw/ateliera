import type { StudioCardProjection } from '@studio/application';

export function SeasonPreview({ season, priorities, onOpen }: {
  season: StudioCardProjection | null;
  priorities: StudioCardProjection[];
  onOpen?: (card: StudioCardProjection, trigger: HTMLButtonElement) => void;
}) {
  if (season === null) return null;
  return (
    <article className="foyer-season" aria-labelledby={`foyer-season-${season.noteId}`}>
      <p className="foyer-section-label">Current season</p>
      <div className="foyer-season__heading">
        <h2 id={`foyer-season-${season.noteId}`}>{season.title}</h2>
        {onOpen && <button className="foyer-text-action" onClick={(event) => onOpen(season, event.currentTarget)} type="button">Open season</button>}
      </div>
      {season.excerpt && season.excerpt !== season.title && <p className="foyer-season__excerpt">{season.excerpt}</p>}
      {priorities.length > 0 && (
        <ol className="foyer-season__priorities" aria-label="This season's priorities">
          {priorities.slice(0, 3).map((priority) => <li key={priority.noteId}>{priority.title}</li>)}
        </ol>
      )}
    </article>
  );
}
