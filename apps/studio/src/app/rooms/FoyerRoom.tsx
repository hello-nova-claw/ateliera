import type {
  CaptureEntry,
  FoyerImageProjection,
  StudioCardProjection,
  StudioService,
} from '@studio/application';
import { FoyerPage, type FoyerSlot } from '../../features/foyer/FoyerPage';
import { useFoyer } from '../../features/foyer/use-foyer';
import { useFoyerCover } from '../../features/foyer/use-foyer-cover';
import { useTodaysGift } from '../../features/foyer/use-todays-gift';
import type { TourExample } from '../../features/onboarding/tour-examples';
import type { UseTourExample } from '../../features/onboarding/TourPreview';

export default function FoyerRoom({
  onCreateFoyer,
  captures = [],
  onOpenCapture,
  onRemoveFoyerImage,
  onOpenCard,
  projectionRevision = 0,
  service,
  tourExamples,
  onUseTourExample,
}: {
  captures?: CaptureEntry[];
  onCreateFoyer?: (slot: FoyerSlot, trigger: HTMLButtonElement) => void;
  onOpenCapture?: (id: string, trigger: HTMLButtonElement) => void;
  onRemoveFoyerImage?: (
    image: FoyerImageProjection,
    trigger: HTMLButtonElement,
  ) => void;
  onOpenCard?: (card: StudioCardProjection, trigger: HTMLButtonElement) => void;
  projectionRevision?: number;
  service?: StudioService;
  tourExamples?: readonly TourExample[];
  onUseTourExample?: UseTourExample;
}) {
  const view = useFoyer(service, projectionRevision);
  const cover = useFoyerCover(service, view.model.image);
  const todaysGift = useTodaysGift(service, new Date().toISOString().slice(0, 10));
  return (
    <>
      <FoyerPage
        cover={cover}
        {...(view.error === undefined ? {} : { error: view.error })}
        gift={todaysGift.gift}
        model={view.model}
        {...(onCreateFoyer === undefined ? {} : { onCreate: onCreateFoyer })}
        onKeepGift={() => void todaysGift.keep()}
        {...(onOpenCard === undefined ? {} : { onOpen: onOpenCard })}
        {...(onRemoveFoyerImage === undefined
          ? {}
          : { onRemoveImage: onRemoveFoyerImage })}
        state={view.state}
        {...(tourExamples ? { tourExamples } : {})}
        {...(onUseTourExample ? { onUseTourExample } : {})}
      />
      {captures.length > 0 && onOpenCapture && (
        <section className="foyer-drafts" aria-labelledby="foyer-drafts-title">
          <p className="foyer-section-label">Continue where you left off</p>
          <h2 id="foyer-drafts-title">A thought is waiting in the Inbox</h2>
          <ul>
            {captures.slice(0, 3).map((capture) => (
              <li key={capture.id}>
                <button
                  className="foyer-text-action"
                  onClick={(event) =>
                    onOpenCapture(capture.id, event.currentTarget)
                  }
                  type="button"
                >
                  {capture.text}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
