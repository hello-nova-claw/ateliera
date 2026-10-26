import tourSteps from '../../content/tour-steps.json';
import type { TourStep } from './onboarding-state';

const guide = {
  foyer: {
    name: 'Foyer',
    copy: tourSteps.foyer,
    next: 'Next room · Life Landscape',
  },
  landscape: {
    name: 'Life Landscape',
    copy: tourSteps.landscape,
    next: 'Next room · Current Season',
  },
  season: {
    name: 'Current Season',
    copy: tourSteps.season,
    next: 'Next room · Uncharted',
  },
  uncharted: {
    name: 'Uncharted',
    copy: tourSteps.uncharted,
    next: 'Next room · Reflection Garden',
  },
  reflection: {
    name: 'Reflection Garden',
    copy: tourSteps.reflection,
    next: 'Finish tour · Return to Foyer',
  },
} satisfies Record<TourStep, { name: string; copy: string; next: string }>;

export function FirstVisitGuide({
  busy = false,
  nextLabel,
  onLeave,
  onNext,
  onPrevious,
  step,
}: {
  busy?: boolean;
  /**
   * Overrides the static "next room" copy when the tour skips rooms that are off
   * (plan §7.4). When the person is on the last on-room, this becomes the finish
   * label so no hidden room is ever named as "next".
   */
  nextLabel?: string;
  onLeave: () => void;
  onNext: () => void;
  onPrevious?: () => void;
  step: TourStep;
}) {
  const content = guide[step];
  const next = nextLabel ?? content.next;
  return (
    <aside
      aria-label={`Guided tour · ${content.name}`}
      className="first-visit-guide"
    >
      <p className="first-visit-guide__eyebrow">
        <span aria-hidden="true" className="first-visit-guide__mark">
          ✦
        </span>{' '}
        Guided first visit
      </p>
      <div className="first-visit-guide__heading">
        <h2 id="first-visit-guide-title" tabIndex={-1}>
          {content.name}
        </h2>
      </div>
      <div
        className="first-visit-guide__content"
        id="first-visit-guide-content"
      >
        <p className="first-visit-guide__copy">{content.copy}</p>
        <p className="first-visit-guide__reminder">
          You can return to this later.
        </p>
        <div className="first-visit-guide__actions">
          <button
            aria-busy={busy}
            className="first-visit-guide__next"
            disabled={busy}
            onClick={onNext}
            type="button"
          >
            <span>{next}</span>
            <span aria-hidden="true">→</span>
          </button>
          {onPrevious && (
            <button disabled={busy} onClick={onPrevious} type="button">
              Previous room
            </button>
          )}
          <button
            className="first-visit-guide__leave"
            disabled={busy}
            onClick={onLeave}
            type="button"
          >
            Leave tour
          </button>
        </div>
      </div>
    </aside>
  );
}
