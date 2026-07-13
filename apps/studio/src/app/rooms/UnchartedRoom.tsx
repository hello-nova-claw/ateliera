import type { StudioCardProjection, StudioService } from '@studio/application';
import { UnchartedPage } from '../../features/uncharted/UnchartedPage';
import { useUncharted } from '../../features/uncharted/use-uncharted';

export default function UnchartedRoom({
  onOpenCard,
  projectionRevision = 0,
  service,
}: {
  onOpenCard?: (card: StudioCardProjection, trigger: HTMLButtonElement) => void;
  projectionRevision?: number;
  service?: StudioService;
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
      state={view.state}
    />
  );
}
