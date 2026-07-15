import { useState } from 'react';
import type {
  FoyerImageProjection,
  FoyerProjection,
  StudioCardProjection,
} from '@studio/application';
import { Becoming } from './Becoming';
import { Feelings } from './Feelings';
import { Legend } from './Legend';
import { Principles } from './Principles';
import { ReturnCard } from './ReturnCard';
import { SeasonPreview } from './SeasonPreview';
import type { FoyerCoverView } from './use-foyer-cover';
import './FoyerPage.css';

export type FoyerSlot = 'becoming' | 'feeling' | 'principle';

export interface FoyerPageProps {
  cover?: FoyerCoverView;
  error?: string;
  model: FoyerProjection;
  onCreate?: (slot: FoyerSlot, trigger: HTMLButtonElement) => void;
  onOpen?: (card: StudioCardProjection, trigger: HTMLButtonElement) => void;
  onRemoveImage?: (
    image: FoyerImageProjection,
    trigger: HTMLButtonElement,
  ) => void;
  state?: 'ready' | 'loading' | 'offline' | 'stale' | 'error';
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
  model,
  onCreate,
  onOpen,
  onRemoveImage,
  state = 'ready',
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
      <header className="foyer-page__header">
        <p className="foyer-page__script">life by design</p>
        <h1>Ateliera</h1>
        <p className="foyer-page__motto">
          A private studio for designing a life from the inside out.
        </p>
      </header>
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
