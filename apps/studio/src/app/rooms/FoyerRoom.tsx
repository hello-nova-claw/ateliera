import type { CaptureEntry, StudioCardProjection, StudioService } from '@studio/application';
import { FoyerPage, type FoyerSlot } from '../../features/foyer/FoyerPage';
import { useFoyer } from '../../features/foyer/use-foyer';

export default function FoyerRoom({
  onCreateFoyer,
  captures = [],
  onOpenCapture,
  onOpenCard,
  projectionRevision = 0,
  service,
}: {
  captures?: CaptureEntry[];
  onCreateFoyer?: (slot: FoyerSlot, trigger: HTMLButtonElement) => void;
  onOpenCapture?: (id: string, trigger: HTMLButtonElement) => void;
  onOpenCard?: (card: StudioCardProjection, trigger: HTMLButtonElement) => void;
  projectionRevision?: number;
  service?: StudioService;
}) {
  const view = useFoyer(service, projectionRevision);
  return <>
    <FoyerPage
        {...(view.error === undefined ? {} : { error: view.error })}
        model={view.model}
        {...(onCreateFoyer === undefined ? {} : { onCreate: onCreateFoyer })}
        {...(onOpenCard === undefined ? {} : { onOpen: onOpenCard })}
        state={view.state}
      />
    {captures.length > 0 && onOpenCapture && (
      <section className="foyer-drafts" aria-labelledby="foyer-drafts-title">
        <p className="foyer-section-label">Continue where you left off</p>
        <h2 id="foyer-drafts-title">A thought is waiting in the Inbox</h2>
        <ul>{captures.slice(0, 3).map((capture) => <li key={capture.id}><button className="foyer-text-action" onClick={(event) => onOpenCapture(capture.id, event.currentTarget)} type="button">{capture.text}</button></li>)}</ul>
      </section>
    )}
  </>;
}
