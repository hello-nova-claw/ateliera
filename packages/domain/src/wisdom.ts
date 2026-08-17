import type { SemanticType } from './semantic-type';

export const wisdomKinds = [
  'insight',
  'quote',
  'principle',
  'practice',
  'question',
  'resource',
  'synthesis',
] as const;
export type WisdomKind = (typeof wisdomKinds)[number];

export interface WisdomTheme {
  id: string;
  title: string;
}

export const defaultWisdomThemes = [
  { id: 'alignment', title: 'Alignment' },
  { id: 'identity', title: 'Identity' },
  { id: 'self-worth', title: 'Self-worth' },
  { id: 'creativity', title: 'Creativity' },
  { id: 'motherhood', title: 'Motherhood' },
  { id: 'money', title: 'Money' },
  { id: 'business', title: 'Business' },
  { id: 'relationships', title: 'Relationships' },
  { id: 'beauty', title: 'Beauty' },
  { id: 'rest', title: 'Rest' },
  { id: 'decision-making', title: 'Decision-making' },
  { id: 'imagination', title: 'Imagination' },
  { id: 'nervous-system-care', title: 'Nervous-system care' },
] as const satisfies readonly WisdomTheme[];

export function semanticTypeForWisdomKind(kind: WisdomKind): SemanticType {
  if (kind === 'principle' || kind === 'synthesis') return 'foundations';
  if (kind === 'practice') return 'growth';
  if (kind === 'question') return 'uncharted';
  return 'reflection';
}
