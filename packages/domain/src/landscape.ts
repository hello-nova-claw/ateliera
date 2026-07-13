export const landscapeAnchors = [
  'vision',
  'identity-values-feelings',
  'decisions',
  'practices',
  'structure-strategy',
] as const;

export type LandscapeAnchor = (typeof landscapeAnchors)[number];
