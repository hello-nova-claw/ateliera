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
        {gift.payload.text}
      </h2>
      {gift.kind !== 'line' && onKeep && (
        <button className="foyer-text-action" onClick={onKeep} type="button">
          Keep
        </button>
      )}
    </article>
  );
}
