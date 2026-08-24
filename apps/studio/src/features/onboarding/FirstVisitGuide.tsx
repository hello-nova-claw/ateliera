import type { TourStep } from './onboarding-state';

const guide = {
  foyer: {
    name: 'Foyer',
    copy: 'The Foyer holds a few things you want to meet again: who you are becoming, how you want life to feel, and the season you are living now.',
    next: 'Next room · Life Landscape',
  },
  landscape: {
    name: 'Life Landscape',
    copy: 'The Landscape looks across life areas through Vision; Identity, values & feelings; Decisions; Practices; and Structure & strategy.',
    next: 'Next room · Current Season',
  },
  season: {
    name: 'Current Season',
    copy: 'A season is a gentle boundary around what matters now. It can hold priorities, experiments, practices, support, and what is deliberately Not Now.',
    next: 'Next room · Uncharted',
  },
  uncharted: {
    name: 'Uncharted',
    copy: 'Uncharted is for possibilities that do not need a plan yet. Begin with “What if…?” and let the idea remain open.',
    next: 'Next room · Reflection Garden',
  },
  reflection: {
    name: 'Reflection Garden',
    copy: 'Reflection Garden gathers what you are learning, celebrating, and seeing differently over time. It is where the Studio begins to remember with you.',
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
