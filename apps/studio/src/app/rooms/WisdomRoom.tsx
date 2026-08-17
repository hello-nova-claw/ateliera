import type { StudioCardProjection, StudioService } from '@studio/application';
import { WisdomPage } from '../../features/wisdom/WisdomPage';
import { useWisdom } from '../../features/wisdom/use-wisdom';

export default function WisdomRoom({
  onOpenCard,
  online = true,
  projectionRevision = 0,
  service,
}: {
  onOpenCard?: (card: StudioCardProjection, trigger: HTMLButtonElement) => void;
  online?: boolean;
  projectionRevision?: number;
  service?: StudioService;
}) {
  const view = useWisdom(service, projectionRevision);
  return (
    <WisdomPage
      {...(view.error ? { error: view.error } : {})}
      model={view.model}
      {...(service ? { onCapture: view.capture } : {})}
      {...(onOpenCard ? { onOpen: onOpenCard } : {})}
      onSaveThemes={view.saveThemes}
      state={
        !online && (view.state === 'ready' || view.state === 'stale')
          ? 'offline'
          : view.state
      }
      themes={view.themes}
    />
  );
}
