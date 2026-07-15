import type { StudioCardProjection, StudioService } from '@studio/application';
import { UnchartedPage } from '../../features/uncharted/UnchartedPage';
import { useUncharted } from '../../features/uncharted/use-uncharted';
import type { TourExample } from '../../features/onboarding/tour-examples';
import type { UseTourExample } from '../../features/onboarding/TourPreview';

export default function UnchartedRoom({
  onOpenCard,
  online = true,
  projectionRevision = 0,
  service,
  tourExamples,
  onUseTourExample,
}: {
  onOpenCard?: (card: StudioCardProjection, trigger: HTMLButtonElement) => void;
  online?: boolean;
  projectionRevision?: number;
  service?: StudioService;
  tourExamples?: readonly TourExample[];
  onUseTourExample?: UseTourExample;
}) {
  const view = useUncharted(service, projectionRevision);
  return (
    <UnchartedPage
      {...(view.activeSeason ? { activeSeason: view.activeSeason } : {})}
      {...(view.error ? { error: view.error } : {})}
      model={view.model}
      onCapture={view.capture}
      onInvite={view.invite}
      {...(onOpenCard ? { onOpen: onOpenCard } : {})}
      state={
        !online && view.state !== 'loading' && view.state !== 'error'
          ? 'offline'
          : view.state
      }
      {...(tourExamples ? { tourExamples } : {})}
      {...(onUseTourExample ? { onUseTourExample } : {})}
    />
  );
}
