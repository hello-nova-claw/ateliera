import { useState } from 'react';
import type {
  FoyerProjection,
  StudioCardProjection,
} from '@studio/application';
import { Becoming } from './Becoming';
import { Feelings } from './Feelings';
import { Legend } from './Legend';
import { Principles } from './Principles';
import { ReturnCard } from './ReturnCard';
import { SeasonPreview } from './SeasonPreview';
import './FoyerPage.css';

export type FoyerSlot = 'becoming' | 'feeling' | 'principle';

export interface FoyerPageProps {
  error?: string;
  model: FoyerProjection;
  onCreate?: (slot: FoyerSlot, trigger: HTMLButtonElement) => void;
  onOpen?: (card: StudioCardProjection, trigger: HTMLButtonElement) => void;
  onRemoveImage?: (noteId: string, trigger: HTMLButtonElement) => void;
  state?: 'ready' | 'loading' | 'offline' | 'stale' | 'error';
}

function imageSource(source: string): string | null {
  const value = source.trim();
  if (value.startsWith('data:image/') || value.startsWith('blob:'))
    return value;
  if (/^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith('//')) return null;
  return value;
}

function FoyerImage({
  image,
  onRemove,
}: {
  image: NonNullable<FoyerProjection['image']>;
  onRemove?: (trigger: HTMLButtonElement) => void;
}) {
  const [missing, setMissing] = useState(false);
  const source = imageSource(image.source);
  if (missing || source === null)
    return (
      <div className="foyer-polaroid__missing">
        <p>This image is not available here.</p>
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
      <img alt={image.alt} onError={() => setMissing(true)} src={source} />
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

export function FoyerPage({
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
  return (
    <div className={`foyer-page${empty ? ' foyer-page--empty' : ''}`}>
      <header className="foyer-page__header">
        <p className="foyer-page__script">life by design</p>
        <h1>The Studio</h1>
        <p className="foyer-page__motto">
          A quiet place to notice what matters, and who you are becoming.
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
              image={model.image}
              {...(onRemoveImage
                ? {
                    onRemove: (trigger: HTMLButtonElement) =>
                      onRemoveImage(model.image!.noteId, trigger),
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
          <ReturnCard card={model.returning} {...(onOpen ? { onOpen } : {})} />
        </aside>
      </div>
      <Legend />
    </div>
  );
}
