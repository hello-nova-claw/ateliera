import type { StudioCardProjection } from '@studio/application';

export function Feelings({ feelings, onCreate }: { feelings: StudioCardProjection[]; onCreate?: () => void }) {
  return (
    <section className="foyer-feelings" aria-labelledby="foyer-feelings-title">
      <p className="foyer-section-label">How I want life to feel</p>
      <h2 className="studio-visually-hidden" id="foyer-feelings-title">Desired feelings</h2>
      {feelings.length === 0 ? (
        <div className="foyer-feelings__empty">
          <p>What feeling would you like to make room for?</p>
          {onCreate && <button className="foyer-action" onClick={onCreate} type="button">Add a desired feeling</button>}
        </div>
      ) : (
        <ul className="foyer-feelings__list">
          {feelings.map((feeling) => <li key={feeling.noteId}>{feeling.title}</li>)}
        </ul>
      )}
    </section>
  );
}
