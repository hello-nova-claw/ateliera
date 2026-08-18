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
      <p id="foyer-gift-title" className="foyer-gift__text">
        {gift.payload.text}
      </p>
      {gift.kind !== 'line' && onKeep && (
        <button className="foyer-text-action" onClick={onKeep} type="button">
          Keep
        </button>
      )}
    </article>
  );
}
