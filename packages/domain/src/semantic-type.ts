export const semanticTypes = [
  'foundations',
  'vision',
  'growth',
  'reflection',
  'celebration',
  'uncharted',
] as const;

export type SemanticType = (typeof semanticTypes)[number];
