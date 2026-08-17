export const landscapeAnchors = [
  'vision',
  'identity-values-feelings',
  'decisions',
  'practices',
  'structure-strategy',
] as const;

export type LandscapeAnchor = (typeof landscapeAnchors)[number];

export function semanticTypeForLandscapeAnchor(
  anchor: LandscapeAnchor,
): import('./semantic-type').SemanticType {
  const meanings = {
    vision: 'vision',
    'identity-values-feelings': 'foundations',
    decisions: 'growth',
    practices: 'growth',
    'structure-strategy': 'foundations',
  } as const;
  return meanings[anchor];
}

export const landscapeAnchorDefinitions = [
  {
    id: 'vision',
    label: 'Vision',
    prompt: 'What would an ordinary Tuesday look like if this were true?',
  },
  {
    id: 'identity-values-feelings',
    label: 'Identity, values & feelings',
    prompt: 'Who is the version of me living this? How does she move in rooms?',
  },
  {
    id: 'decisions',
    label: 'Decisions',
    prompt: 'What can I choose in the next 30, 60, or 90 days?',
  },
  {
    id: 'practices',
    label: 'Practices',
    prompt: 'What rhythm lets this be lived repeatedly?',
  },
  {
    id: 'structure-strategy',
    label: 'Structure & strategy',
    prompt:
      'What time, environment, help, boundary, money, or system supports it?',
  },
] as const satisfies readonly {
  id: LandscapeAnchor;
  label: string;
  prompt: string;
}[];

export const decisionHorizons = ['30d', '60d', '90d', 'someday'] as const;
export type DecisionHorizon = (typeof decisionHorizons)[number];

export function isDecisionHorizon(value: unknown): value is DecisionHorizon {
  return decisionHorizons.includes(value as DecisionHorizon);
}
