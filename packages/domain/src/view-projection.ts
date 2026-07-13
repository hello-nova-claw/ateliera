import type { SemanticType } from './semantic-type';

export interface CardProjection {
  id: string;
  title: string;
  excerpt: string;
  semanticType: SemanticType;
}
