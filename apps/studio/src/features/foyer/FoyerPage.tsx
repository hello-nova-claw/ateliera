import { useState } from 'react';
import type {
  FoyerImageProjection,
  FoyerProjection,
  StudioCardProjection,
} from '@studio/application';
import { RoomHeading } from '@studio/ui';
import { Becoming } from './Becoming';
import { Feelings } from './Feelings';
import { Legend } from './Legend';
import { Principles } from './Principles';
import { ReturnCard } from './ReturnCard';
import { SeasonPreview } from './SeasonPreview';
import { TodaysGift } from './TodaysGift';
import type { FoyerCoverView } from './use-foyer-cover';
import type { Gift, KeepState } from './use-todays-gift';
import type { TourExample } from '../onboarding/tour-examples';
import {
  TourExampleCard,
  TourGlimpseLabel,
  type UseTourExample,
} from '../onboarding/TourPreview';
import './FoyerPage.css';

export type FoyerSlot = 'becoming' | 'feeling' | 'principle';

export interface FoyerPageProps {
  cover?: FoyerCoverView;
  error?: string;
  gift?: Gift | null;
  giftKeepState?: KeepState;
  giftKeepError?: string;
  model: FoyerProjection;
  onCreate?: (slot: FoyerSlot, trigger: HTMLButtonElement) => void;
  onKeepGift?: () => void;
  onOpen?: (card: StudioCardProjection, trigger: HTMLButtonElement) => void;
  onRemoveImage?: (
    image: FoyerImageProjection,
    trigger: HTMLButtonElement,
  ) => void;
  state?: 'ready' | 'loading' | 'offline' | 'stale' | 'error';
  tourExamples?: readonly TourExample[];
  onUseTourExample?: UseTourExample;
}

function FoyerImage({
  cover,
  image,
  onRemove,
}: {
  cover: FoyerCoverView;
  image: NonNullable<FoyerProjection['image']>;
  onRemove?: (trigger: HTMLButtonElement) => void;
}) {
  const [missing, setMissing] = useState(false);
  if (cover.state === 'loading') {
    return (
      <div className="foyer-polaroid__missing" role="status">
        Preparing this image…
      </div>
    );
  }
  if (missing || cover.state !== 'ready')
    return (
      <div className="foyer-polaroid__missing">
        <p>This image is not available here.</p>
        <p className="foyer-polaroid__description">{image.alt}</p>
        {onRemove && (
          <button
            className="foyer-text-action"
            onClick={(event) => onRemove(event.currentTarget)}
            type="button"
          >
            Remove this image
          </button>
        )}
      </div>
    );
  return (
    <figure className="foyer-polaroid">
      <span aria-hidden="true" className="foyer-polaroid__tape" />
      <img alt={image.alt} onError={() => setMissing(true)} src={cover.url} />
      {image.caption && <figcaption>{image.caption}</figcaption>}
      {onRemove && (
        <button
          className="foyer-text-action"
          onClick={(event) => onRemove(event.currentTarget)}
          type="button"
        >
          Remove this image
        </button>
      )}
    </figure>
  );
}

function FoyerSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="foyer-skeleton"
      data-testid="foyer-skeleton"
    >
      <div className="foyer-skeleton__wide">
        <span className="foyer-skeleton__line foyer-skeleton__line--label" />
        <span className="foyer-skeleton__line foyer-skeleton__line--title" />
        <span className="foyer-skeleton__line foyer-skeleton__line--title-short" />
        <span className="foyer-skeleton__panel" />
      </div>
      <div className="foyer-skeleton__narrow">
        <span className="foyer-skeleton__line foyer-skeleton__line--label" />
        <span className="foyer-skeleton__pill" />
        <span className="foyer-skeleton__card" />
      </div>
    </div>
  );
}

export function FoyerPage({
  cover = { state: 'none' },
  error,
  gift = null,
  giftKeepState,
  giftKeepError,
  model,
  onCreate,
  onKeepGift,
  onOpen,
  onRemoveImage,
  onUseTourExample,
  state = 'ready',
  tourExamples = [],
}: FoyerPageProps) {
  const empty =
    model.becoming === null &&
    model.feelings.length === 0 &&
    model.principles.length === 0;
  const firstLoad =
    state === 'loading' &&
    empty &&
    model.currentSeason === null &&
    model.priorities.length === 0 &&
    model.returning === null &&
    model.image === null;
  return (
    <div className={`foyer-page${empty ? ' foyer-page--empty' : ''}`}>
      <div className="foyer-page__header">
        <RoomHeading
          eyebrow="life by design"
          intro="A private studio for designing a life from the inside out."
          title="Ateliera"
        />
      </div>
      {state === 'loading' && (
        <p className="foyer-page__state" role="status">
          Gathering the Foyer…
        </p>
      )}
      {state === 'stale' && (
        <p className="foyer-page__state" role="status">
          Showing what is here while the index catches up.
        </p>
      )}
      {state === 'offline' && (
        <p className="foyer-page__state" role="status">
          Stored locally. The Foyer remains available offline.
        </p>
      )}
      {state === 'error' && (
        <p className="foyer-page__state foyer-page__state--error" role="alert">
          {error ??
            'The Foyer could not be gathered. Your notes remain in the Studio.'}
        </p>
      )}
      {firstLoad ? (
        <FoyerSkeleton />
      ) : (
        <div className="foyer-page__spread">
          <div className="foyer-page__wide">
            {tourExamples.length > 0 && <TourGlimpseLabel />}
            <Becoming
              card={model.becoming}
              {...(onCreate
                ? {
                    onCreate: (trigger: HTMLButtonElement) =>
                      onCreate('becoming', trigger),
                  }
                : {})}
              {...(onOpen ? { onOpen } : {})}
            />
            {model.becoming === null &&
              tourExamples
                .filter((example) => example.previewKey === 'foyer-becoming')
                .map((example) => (
                  <TourExampleCard
                    className="foyer-tour-glimpse foyer-tour-glimpse--becoming"
                    example={example}
                    key={example.previewKey}
                    {...(onUseTourExample ? { onUse: onUseTourExample } : {})}
                  />
                ))}
            <TodaysGift
              gift={gift}
              {...(onKeepGift ? { onKeep: onKeepGift } : {})}
              {...(giftKeepState === undefined ? {} : { keepState: giftKeepState })}
              {...(giftKeepError === undefined ? {} : { keepError: giftKeepError })}
            />
            <SeasonPreview
              priorities={model.priorities}
              season={model.currentSeason}
              {...(onOpen ? { onOpen } : {})}
            />
            <Principles
              principles={model.principles}
              {...(onCreate
                ? {
                    onCreate: (trigger: HTMLButtonElement) =>
                      onCreate('principle', trigger),
                  }
                : {})}
              {...(onOpen ? { onOpen } : {})}
            />
            {tourExamples
              .filter((example) => example.previewKey === 'foyer-principle')
              .map((example) => (
                <TourExampleCard
                  className="foyer-tour-glimpse foyer-tour-glimpse--principle"
                  example={example}
                  key={example.previewKey}
                />
              ))}
          </div>
          <aside className="foyer-page__narrow" aria-label="Feeling and return">
            {model.image && (
              <FoyerImage
                cover={cover}
                image={model.image}
                {...(onRemoveImage
                  ? {
                      onRemove: (trigger: HTMLButtonElement) =>
                        onRemoveImage(model.image!, trigger),
                    }
                  : {})}
              />
            )}
            <Feelings
              feelings={model.feelings}
              {...(onCreate
                ? {
                    onCreate: (trigger: HTMLButtonElement) =>
                      onCreate('feeling', trigger),
                  }
                : {})}
            />
            {tourExamples
              .filter((example) => example.previewKey === 'foyer-feeling')
              .map((example) => (
                <TourExampleCard
                  className="foyer-tour-glimpse foyer-tour-glimpse--feeling"
                  example={example}
                  key={example.previewKey}
                />
              ))}
            <ReturnCard
              card={model.returning}
              {...(onOpen ? { onOpen } : {})}
            />
          </aside>
        </div>
      )}
      <Legend />
    </div>
  );
}
