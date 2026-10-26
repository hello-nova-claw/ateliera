import landscapePrompts from './content/landscape-prompts.json';

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
    prompt: landscapePrompts['vision'],
  },
  {
    id: 'identity-values-feelings',
    label: 'Identity, values & feelings',
    prompt: landscapePrompts['identity-values-feelings'],
  },
  {
    id: 'decisions',
    label: 'Decisions',
    prompt: landscapePrompts['decisions'],
  },
  {
    id: 'practices',
    label: 'Practices',
    prompt: landscapePrompts['practices'],
  },
  {
    id: 'structure-strategy',
    label: 'Structure & strategy',
    prompt: landscapePrompts['structure-strategy'],
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
