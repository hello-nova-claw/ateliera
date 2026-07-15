import type { TourStep } from './onboarding-state';
import { useState } from 'react';

const guide = {
  foyer: {
    name: 'Foyer',
    copy: 'The Foyer holds a few things you want to meet again: who you are becoming, how you want life to feel, and the season you are living now.',
    next: 'Wander into the Landscape',
  },
  landscape: {
    name: 'Life Landscape',
    copy: 'The Landscape looks across life areas through Vision; Identity, values & feelings; Decisions; Practices; and Structure & strategy.',
    next: 'Visit Current Season',
  },
  season: {
    name: 'Current Season',
    copy: 'A season is a gentle boundary around what matters now. It can hold priorities, experiments, practices, support, and what is deliberately Not Now.',
    next: 'Step into Uncharted',
  },
  uncharted: {
    name: 'Uncharted',
    copy: 'Uncharted is for possibilities that do not need a plan yet. Begin with “What if…?” and let the idea remain open.',
    next: 'Walk into Reflection Garden',
  },
  reflection: {
    name: 'Reflection Garden',
    copy: 'Reflection Garden gathers what you are learning, celebrating, and seeing differently over time. It is where the Studio begins to remember with you.',
    next: 'Return to the Foyer',
  },
} satisfies Record<TourStep, { name: string; copy: string; next: string }>;

export function FirstVisitGuide({
  busy = false,
  onLeave,
  onNext,
  onPrevious,
  step,
}: {
  busy?: boolean;
  onLeave: () => void;
  onNext: () => void;
  onPrevious?: () => void;
  step: TourStep;
}) {
  const content = guide[step];
  const [collapsed, setCollapsed] = useState(false);
  return (
    <aside
      aria-labelledby="first-visit-guide-title"
      className="first-visit-guide"
      data-collapsed={collapsed}
    >
      <p className="first-visit-guide__eyebrow">First visit</p>
      <div className="first-visit-guide__heading">
        <h2 id="first-visit-guide-title">{content.name}</h2>
        <button
          aria-controls="first-visit-guide-content"
          aria-expanded={!collapsed}
          className="first-visit-guide__compact-toggle"
          onClick={() => setCollapsed((current) => !current)}
          type="button"
        >
          {collapsed ? 'Open guide' : 'Close guide'}
        </button>
      </div>
      <div className="first-visit-guide__content" id="first-visit-guide-content">
        <p className="first-visit-guide__copy">{content.copy}</p>
        <p className="first-visit-guide__reminder">
          You can return to this later.
        </p>
        <div className="first-visit-guide__actions">
          {onPrevious && (
            <button disabled={busy} onClick={onPrevious} type="button">
              Previous room
            </button>
          )}
          <button
            aria-busy={busy}
            className="first-visit-guide__next"
            disabled={busy}
            onClick={onNext}
            type="button"
          >
            {content.next}
          </button>
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
