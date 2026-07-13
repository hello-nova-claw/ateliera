import type { StudioCardProjection } from '@studio/application';

export function Principles({ principles, onCreate, onOpen }: {
  principles: StudioCardProjection[];
  onCreate?: () => void;
  onOpen?: (card: StudioCardProjection, trigger: HTMLButtonElement) => void;
}) {
  return (
    <section className="foyer-principles" aria-labelledby="foyer-principles-title">
      <div className="foyer-principles__heading">
        <div><p className="foyer-section-label">Guiding principles</p><h2 id="foyer-principles-title">What supports this life?</h2></div>
        {principles.length === 0 && onCreate && <button className="foyer-action" onClick={onCreate} type="button">Add a principle</button>}
      </div>
      {principles.length > 0 && (
        <div className="foyer-principles__grid">
          {principles.slice(0, 3).map((principle) => (
            <article className="foyer-principle" key={principle.noteId}>
              <span aria-hidden="true" className="foyer-principle__mark">♥</span>
              <h3>{principle.title}</h3>
              {principle.excerpt && principle.excerpt !== principle.title && <p>{principle.excerpt}</p>}
              {onOpen && <button className="foyer-text-action" onClick={(event) => onOpen(principle, event.currentTarget)} type="button">Edit principle</button>}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
