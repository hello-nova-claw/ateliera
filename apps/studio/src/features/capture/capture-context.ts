import {
  semanticTypeForCapturePlacement,
  type CapturePlacement,
} from '@studio/application';
import {
  semanticTypeForLandscapeAnchor,
  type LandscapeAnchor,
  type SemanticType,
} from '@studio/domain';

export function captureMeaningForContext(context: {
  landscape?: { lifeArea: string; anchor: LandscapeAnchor };
  path?: string;
  placement?: CapturePlacement;
}): { semanticType: SemanticType; locked: boolean } | undefined {
  if (context.placement !== undefined)
    return {
      semanticType: semanticTypeForCapturePlacement(context.placement),
      locked: true,
    };
  if (context.landscape !== undefined)
    return {
      semanticType: semanticTypeForLandscapeAnchor(context.landscape.anchor),
      locked: true,
    };
  if (context.path === '/uncharted')
    return { semanticType: 'uncharted', locked: false };
  if (context.path === '/reflection')
    return { semanticType: 'reflection', locked: false };
  if (context.path === '/identity')
    return { semanticType: 'foundations', locked: false };
  if (context.path === '/wisdom')
    return { semanticType: 'reflection', locked: false };
  return undefined;
}
