import type { Gift } from './use-todays-gift';
import './TodaysGift.css';

export interface TodaysGiftProps {
  gift: Gift | null;
  onKeep?: () => void;
}

export function TodaysGift({ gift, onKeep }: TodaysGiftProps) {
  if (gift === null) return null;
  return (
    <article className="foyer-gift" aria-labelledby="foyer-gift-title">
      <p className="foyer-section-label">Today's gift</p>
      <h2 id="foyer-gift-title" className="foyer-gift__text">
        {gift.payload.title}
      </h2>
      {gift.payload.excerpt && gift.payload.excerpt !== gift.payload.title && (
        <p className="foyer-gift__excerpt">{gift.payload.excerpt}</p>
      )}
      {gift.kind !== 'line' && onKeep && (
        <button className="foyer-text-action" onClick={onKeep} type="button">
          Keep
        </button>
      )}
    </article>
  );
}
