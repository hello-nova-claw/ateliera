import type { SemanticType } from './semantic-type';
import identityPrompts from './content/identity-prompts.json';

export const identitySectionDefinitions = [
  {
    id: 'already-true',
    label: 'Already true',
    prompt: identityPrompts['already-true'],
    cardType: 'identity-truth',
    semanticType: 'foundations',
  },
  {
    id: 'practicing-now',
    label: 'Practicing now',
    prompt: identityPrompts['practicing-now'],
    cardType: 'identity-emerging',
    semanticType: 'growth',
  },
  {
    id: 'values-principles',
    label: 'Values & principles',
    prompt: identityPrompts['values-principles'],
    cardType: 'principle',
    semanticType: 'foundations',
  },
  {
    id: 'desired-feelings',
    label: 'How I want to feel',
    prompt: identityPrompts['desired-feelings'],
    cardType: 'feeling',
    semanticType: 'vision',
  },
  {
    id: 'beliefs-practice',
    label: 'Beliefs in practice',
    prompt: identityPrompts['beliefs-practice'],
    cardType: 'belief',
    semanticType: 'foundations',
  },
  {
    id: 'embodiment-cues',
    label: 'Embodiment cues',
    prompt: identityPrompts['embodiment-cues'],
    cardType: 'embodiment-cue',
    semanticType: 'growth',
  },
  {
    id: 'identity-shifts',
    label: 'Identity shifts',
    prompt: identityPrompts['identity-shifts'],
    cardType: 'identity-shift',
    semanticType: 'reflection',
  },
] as const satisfies readonly {
  id: string;
  label: string;
  prompt: string;
  cardType: string;
  semanticType: SemanticType;
}[];

export type IdentitySection = (typeof identitySectionDefinitions)[number]['id'];

const sharedCardSections: Readonly<Record<string, IdentitySection>> = {
  identity: 'practicing-now',
  value: 'values-principles',
  principle: 'values-principles',
  feeling: 'desired-feelings',
};

export function identitySectionForCardType(
  cardType: string,
): IdentitySection | undefined {
  return (
    identitySectionDefinitions.find((section) => section.cardType === cardType)
      ?.id ?? sharedCardSections[cardType]
  );
}

export function identitySectionDefinition(section: IdentitySection) {
  return identitySectionDefinitions.find(
    (candidate) => candidate.id === section,
  )!;
}
