import type { SemanticType } from '@studio/domain';
import './SemanticMark.css';

const labels: Record<SemanticType, string> = {
  foundations: 'Foundations',
  vision: 'Vision',
  growth: 'Growth',
  reflection: 'Reflection',
  celebration: 'Celebration',
  uncharted: 'Uncharted',
};

export interface SemanticMarkProps {
  labelMode?: 'hidden' | 'visible';
  type: SemanticType;
}

export function SemanticMark({ type, labelMode = 'hidden' }: SemanticMarkProps) {
  return (
    <span className={`semantic-mark semantic-mark--${type}`}>
      <svg
        aria-hidden="true"
        className="semantic-mark__heart"
        viewBox="0 0 24 24"
      >
        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
      </svg>
      <span
        className={
          labelMode === 'hidden' ? 'visually-hidden' : 'semantic-mark__label'
        }
      >
        {labels[type]}
      </span>
    </span>
  );
}
