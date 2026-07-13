import type { StudioCardProjection } from '@studio/application';

interface BecomingProps {
  card: StudioCardProjection | null;
  onCreate?: (trigger: HTMLButtonElement) => void;
  onOpen?: (card: StudioCardProjection, trigger: HTMLButtonElement) => void;
}

export function Becoming({ card, onCreate, onOpen }: BecomingProps) {
  if (card === null) {
    return (
      <section className="foyer-becoming foyer-becoming--empty" aria-labelledby="foyer-becoming-title">
        <p className="foyer-section-label">Currently becoming</p>
        <h2 id="foyer-becoming-title">What are you currently becoming?</h2>
        {onCreate && <button className="foyer-action" onClick={(event) => onCreate(event.currentTarget)} type="button">Add a becoming sentence</button>}
      </section>
    );
  }
  return (
    <article className="foyer-becoming" aria-labelledby={`foyer-becoming-${card.noteId}`}>
      <p className="foyer-section-label">Currently becoming</p>
      <h2 id={`foyer-becoming-${card.noteId}`}>{card.title}</h2>
      {card.excerpt && card.excerpt !== card.title && <p>{card.excerpt}</p>}
      {onOpen && <button className="foyer-text-action" onClick={(event) => onOpen(card, event.currentTarget)} type="button">Edit becoming</button>}
    </article>
  );
}
