import { useEffect, useRef } from 'react';
import './FirstVisit.css';

export function FirstVisitWelcome({
  busy = false,
  error,
  mode,
  onEnter,
  onTour,
}: {
  busy?: boolean;
  error?: string;
  mode: 'new' | 'resume';
  onEnter: () => void;
  onTour: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <main aria-labelledby="first-visit-title" className="first-visit-welcome">
      <div className="first-visit-welcome__content">
        <p className="first-visit-welcome__wordmark">Ateliera</p>
        <p className="first-visit-welcome__script">inside out</p>
        <h1 id="first-visit-title" ref={heading} tabIndex={-1}>
          {mode === 'resume' ? 'Welcome back.' : 'Your Studio Space is ready.'}
        </h1>
        <p className="first-visit-welcome__intro">
          {mode === 'resume'
            ? 'You can continue wandering from where you left off, or enter the Studio as it is.'
            : 'Nothing here needs to be finished. Ateliera is a place to return to, rearrange, and let grow with you.'}
        </p>
        <div className="first-visit-welcome__actions">
          <button
            aria-busy={busy}
            className="first-visit-welcome__primary"
            disabled={busy}
            onClick={onTour}
            type="button"
          >
            {mode === 'resume' ? 'Continue the tour' : 'Take a gentle tour'}
          </button>
          <button
            className="first-visit-welcome__secondary"
            disabled={busy}
            onClick={onEnter}
            type="button"
          >
            Enter my Studio
          </button>
        </div>
        <p className="first-visit-welcome__aside">
          The tour is optional, and you can leave it at any time.
        </p>
        {error !== undefined && (
          <p className="first-visit-welcome__error" role="alert">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
