import type { SemanticType } from './semantic-type';

export const identitySectionDefinitions = [
  {
    id: 'already-true',
    label: 'Already true',
    prompt: 'What already feels quietly and honestly true?',
    cardType: 'identity-truth',
    semanticType: 'foundations',
  },
  {
    id: 'practicing-now',
    label: 'Practicing now',
    prompt: 'What quality are you practicing in this season?',
    cardType: 'identity-emerging',
    semanticType: 'growth',
  },
  {
    id: 'values-principles',
    label: 'Values & principles',
    prompt: 'What helps you recognise a life that feels like yours?',
    cardType: 'principle',
    semanticType: 'foundations',
  },
  {
    id: 'desired-feelings',
    label: 'How I want to feel',
    prompt: 'What feeling would you like to make room for?',
    cardType: 'feeling',
    semanticType: 'vision',
  },
  {
    id: 'beliefs-practice',
    label: 'Beliefs in practice',
    prompt: 'What belief are you testing, strengthening, or revising?',
    cardType: 'belief',
    semanticType: 'foundations',
  },
  {
    id: 'embodiment-cues',
    label: 'Embodiment cues',
    prompt: 'What does this look like in an ordinary hour?',
    cardType: 'embodiment-cue',
    semanticType: 'growth',
  },
  {
    id: 'identity-shifts',
    label: 'Identity shifts',
    prompt: 'What language or assumption has changed over time?',
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
