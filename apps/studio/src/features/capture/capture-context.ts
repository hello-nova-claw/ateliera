import {
  semanticTypeForCapturePlacement,
  type CapturePlacement,
} from '@studio/application';
import {
  semanticTypeForLandscapeAnchor,
  type LandscapeAnchor,
  type SemanticType,
} from '@studio/domain';
import {
  foyerCaptureGuidance,
  genericCaptureGuidance,
  landscapeCaptureGuidance,
  unchartedCaptureGuidance,
  type CaptureGuidance,
} from './field-guidance';

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

/**
 * The capture dialog's voice for where it was opened: the three Foyer slots,
 * Uncharted, and each Life Landscape anchor get bespoke copy; everything else
 * keeps the generic "Hold this thought".
 */
export function captureGuidanceForContext(context: {
  landscape?: { lifeArea: string; anchor: LandscapeAnchor };
  placement?: CapturePlacement;
}): CaptureGuidance {
  if (
    context.placement !== undefined &&
    context.placement in foyerCaptureGuidance
  )
    return foyerCaptureGuidance[
      context.placement as keyof typeof foyerCaptureGuidance
    ];
  if (context.placement === 'uncharted') return unchartedCaptureGuidance;
  if (context.landscape !== undefined)
    return landscapeCaptureGuidance[context.landscape.anchor];
  return genericCaptureGuidance;
}
