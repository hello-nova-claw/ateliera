import type { SemanticType } from '@studio/domain';
import { Icon, type IconName } from '../Icon/Icon';
import './SemanticMark.css';

const labels: Record<SemanticType, string> = {
  foundations: 'Foundations',
  vision: 'Vision',
  growth: 'Growth',
  reflection: 'Reflection',
  celebration: 'Celebration',
  uncharted: 'Uncharted',
};

// Each meaning has a quiet line glyph, tinted by its meaning colour.
const glyphs: Record<SemanticType, IconName> = {
  foundations: 'waves',
  vision: 'sun',
  growth: 'leaf',
  reflection: 'moon',
  celebration: 'sparkle',
  uncharted: 'constellation',
};

export interface SemanticMarkProps {
  labelMode?: 'hidden' | 'visible';
  type: SemanticType;
}

export function SemanticMark({ type, labelMode = 'hidden' }: SemanticMarkProps) {
  return (
    <span className={`semantic-mark semantic-mark--${type}`}>
      <span aria-hidden="true" className="semantic-mark__badge">
        <Icon className="semantic-mark__glyph" name={glyphs[type]} size={18} />
      </span>
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
