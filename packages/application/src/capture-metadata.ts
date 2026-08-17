import type { SemanticType } from '@studio/domain';

export type CapturePlacement =
  | 'foyer-becoming'
  | 'foyer-feeling'
  | 'foyer-principle'
  | 'uncharted'
  | 'reflection'
  | 'celebration';

const capturePlacements = {
  'foyer-becoming': {
    cardType: 'identity',
    semanticType: 'foundations',
    rooms: ['foyer', 'identity-studio'],
    folder: 'Foyer',
  },
  'foyer-feeling': {
    cardType: 'feeling',
    semanticType: 'vision',
    rooms: ['foyer', 'identity-studio'],
    folder: 'Foyer',
  },
  'foyer-principle': {
    cardType: 'principle',
    semanticType: 'foundations',
    rooms: ['foyer', 'identity-studio'],
    folder: 'Foyer',
  },
  uncharted: {
    cardType: 'possibility',
    semanticType: 'uncharted',
    rooms: ['uncharted'],
    folder: 'Uncharted',
  },
  reflection: {
    cardType: 'reflection',
    semanticType: 'reflection',
    rooms: ['reflection-garden'],
    folder: 'Reflection Garden/Reflections',
  },
  celebration: {
    cardType: 'celebration',
    semanticType: 'celebration',
    rooms: ['reflection-garden'],
    folder: 'Reflection Garden/Celebrations',
  },
} as const satisfies Record<
  CapturePlacement,
  {
    cardType: string;
    semanticType: SemanticType;
    rooms: readonly string[];
    folder: string;
  }
>;

export function capturePlacementMetadata(placement: CapturePlacement) {
  return capturePlacements[placement];
}

export function semanticTypeForCapturePlacement(
  placement: CapturePlacement,
): SemanticType {
  return capturePlacementMetadata(placement).semanticType;
}
