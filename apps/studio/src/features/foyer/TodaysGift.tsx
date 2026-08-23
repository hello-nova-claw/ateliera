import { GIFT_GRADES, type Gift, type KeepState } from './use-todays-gift';
import './TodaysGift.css';

export interface TodaysGiftProps {
  gift: Gift | null;
  onKeep?: (quality: number) => void;
  keepState?: KeepState;
  keepError?: string;
  keepMessage?: string;
}

export function TodaysGift({
  gift,
  onKeep,
  keepState = 'idle',
  keepError,
  keepMessage,
}: TodaysGiftProps) {
  if (gift === null) return null;
  const busy = keepState === 'busy';
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
          <p className="foyer-gift__prompt">How did this land?</p>
          <div className="foyer-gift__grades" role="group" aria-label="How did this land?">
            <button
              className="foyer-text-action"
              disabled={busy}
              onClick={() => onKeep(GIFT_GRADES.notNow)}
              type="button"
            >
              Not now
            </button>
            <button
              aria-busy={busy}
              className="foyer-text-action"
              disabled={busy}
              onClick={() => onKeep(GIFT_GRADES.keep)}
              type="button"
            >
              Keep
            </button>
            <button
              className="foyer-text-action"
              disabled={busy}
              onClick={() => onKeep(GIFT_GRADES.deeply)}
              type="button"
            >
              This landed deeply
            </button>
          </div>
          {keepState === 'error' && (
            <p className="foyer-gift__error" role="alert">
              {keepError ?? 'This gift could not be kept just now.'}
            </p>
          )}
          {keepState === 'success' && (
            <p className="foyer-gift__success" role="status">
              {keepMessage ?? 'Kept.'}
            </p>
          )}
        </>
      )}
    </article>
  );
}
