import type { StudioCardProjection } from '@studio/application';

export function ReturnCard({ card, onOpen }: {
  card: StudioCardProjection | null;
  onOpen?: (card: StudioCardProjection, trigger: HTMLButtonElement) => void;
}) {
  if (card === null) return null;
  const label = card.semanticType === 'celebration' ? 'Something worth remembering' : 'A quiet return';
  return (
    <article className={`foyer-return foyer-return--${card.semanticType}`} aria-labelledby={`foyer-return-${card.noteId}`}>
      <span aria-hidden="true" className="foyer-return__mark">♥</span>
      <div><p className="foyer-section-label">{label}</p><h2 id={`foyer-return-${card.noteId}`}>{card.title}</h2>
        {card.excerpt && card.excerpt !== card.title && <p>{card.excerpt}</p>}
        {onOpen && <button className="foyer-text-action" onClick={(event) => onOpen(card, event.currentTarget)} type="button">Revisit this note</button>}
      </div>
    </article>
  );
}
