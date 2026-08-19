import type { Gift, KeepState } from './use-todays-gift';
import './TodaysGift.css';

export interface TodaysGiftProps {
  gift: Gift | null;
  onKeep?: () => void;
  keepState?: KeepState;
  keepError?: string;
}

export function TodaysGift({
  gift,
  onKeep,
  keepState = 'idle',
  keepError,
}: TodaysGiftProps) {
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
        <>
          <button
            aria-busy={keepState === 'busy'}
            className="foyer-text-action"
            disabled={keepState === 'busy'}
            onClick={onKeep}
            type="button"
          >
            {keepState === 'busy' ? 'Keeping…' : 'Keep'}
          </button>
          {keepState === 'error' && (
            <p className="foyer-gift__error" role="alert">
              {keepError ?? 'This gift could not be kept just now.'}
            </p>
          )}
          {keepState === 'success' && (
            <p className="foyer-gift__success" role="status">
              Kept.
            </p>
          )}
        </>
      )}
    </article>
  );
}
