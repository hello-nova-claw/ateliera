import type {
  CaptureEntry,
  FoyerImageProjection,
  StudioCardProjection,
  StudioService,
} from '@studio/application';
import { FoyerPage, type FoyerSlot } from '../../features/foyer/FoyerPage';
import { useAlmanac } from '../../features/foyer/use-almanac';
import { useFoyer } from '../../features/foyer/use-foyer';
import { useFoyerCover } from '../../features/foyer/use-foyer-cover';
import { useTodaysGift } from '../../features/foyer/use-todays-gift';
import type { TourExample } from '../../features/onboarding/tour-examples';
import type { UseTourExample } from '../../features/onboarding/TourPreview';

function localDateISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function FoyerRoom({
  onCreateFoyer,
  captures = [],
  now = () => new Date(),
  onOpenCapture,
  onRemoveFoyerImage,
  onOpenCard,
  projectionRevision = 0,
  service,
  tourExamples,
  onUseTourExample,
}: {
  captures?: CaptureEntry[];
  now?: () => Date;
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
  const today = localDateISO(now());
  const todaysGift = useTodaysGift(service, today);
  const almanac = useAlmanac(service, today);
  return (
    <>
      <FoyerPage
        almanac={almanac}
        cover={cover}
        {...(view.error === undefined ? {} : { error: view.error })}
        gift={todaysGift.gift}
        giftKeepState={todaysGift.keepState}
        {...(todaysGift.keepError === undefined
          ? {}
          : { giftKeepError: todaysGift.keepError })}
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
