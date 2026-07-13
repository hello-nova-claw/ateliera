import type { SemanticType } from '@studio/domain';
import { type ReactNode, useId } from 'react';
import { SemanticMark } from '../SemanticMark/SemanticMark';
import './Card.css';

export interface CardProps {
  actions?: ReactNode;
  excerpt?: string;
  semanticType: SemanticType;
  title: string;
}

export function Card({ actions, excerpt, semanticType, title }: CardProps) {
  const titleId = useId();

  return (
    <article aria-labelledby={titleId} className={`card card--${semanticType}`}>
      <header className="card__header">
        <SemanticMark labelMode="visible" type={semanticType} />
        <h2 className="card__title" id={titleId}>
          {title}
        </h2>
      </header>
      {excerpt ? <p className="card__excerpt">{excerpt}</p> : null}
      {actions ? (
        <div aria-label={`Actions for ${title}`} className="card__actions" role="group">
          {actions}
        </div>
      ) : null}
    </article>
  );
}
