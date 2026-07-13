import { useState } from 'react';
import type { FoyerProjection, StudioCardProjection } from '@studio/application';
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
  state?: 'ready' | 'loading' | 'offline' | 'stale' | 'error';
}

function FoyerImage({ image }: { image: NonNullable<FoyerProjection['image']> }) {
  const [missing, setMissing] = useState(false);
  if (missing) return <p className="foyer-polaroid__missing">This image is not available here.</p>;
  return (
    <figure className="foyer-polaroid">
      <span aria-hidden="true" className="foyer-polaroid__tape" />
      <img alt={image.alt} onError={() => setMissing(true)} src={image.source} />
      {image.caption && <figcaption>{image.caption}</figcaption>}
    </figure>
  );
}

export function FoyerPage({ error, model, onCreate, onOpen, state = 'ready' }: FoyerPageProps) {
  const empty = model.becoming === null && model.feelings.length === 0 && model.principles.length === 0;
  return (
    <div className={`foyer-page${empty ? ' foyer-page--empty' : ''}`}>
      <header className="foyer-page__header">
        <p className="foyer-page__script">life by design</p>
        <h1>The Studio</h1>
        <p className="foyer-page__motto">A quiet place to notice what matters, and who you are becoming.</p>
      </header>
      {state === 'loading' && <p className="foyer-page__state" role="status">Gathering the Foyer…</p>}
      {state === 'stale' && <p className="foyer-page__state" role="status">Showing what is here while the index catches up.</p>}
      {state === 'offline' && <p className="foyer-page__state" role="status">Stored locally. The Foyer remains available offline.</p>}
      {state === 'error' && <p className="foyer-page__state foyer-page__state--error" role="alert">{error ?? 'The Foyer could not be gathered. Your notes remain in the Studio.'}</p>}
      <div className="foyer-page__spread">
        <div className="foyer-page__wide">
          <Becoming card={model.becoming} {...(onCreate ? { onCreate: (trigger: HTMLButtonElement) => onCreate('becoming', trigger) } : {})} {...(onOpen ? { onOpen } : {})} />
          <SeasonPreview priorities={model.priorities} season={model.currentSeason} {...(onOpen ? { onOpen } : {})} />
          <Principles principles={model.principles} {...(onCreate ? { onCreate: (trigger: HTMLButtonElement) => onCreate('principle', trigger) } : {})} {...(onOpen ? { onOpen } : {})} />
        </div>
        <aside className="foyer-page__narrow" aria-label="Feeling and return">
          {model.image && <FoyerImage image={model.image} />}
          <Feelings feelings={model.feelings} {...(onCreate ? { onCreate: (trigger: HTMLButtonElement) => onCreate('feeling', trigger) } : {})} />
          <ReturnCard card={model.returning} {...(onOpen ? { onOpen } : {})} />
        </aside>
      </div>
      <Legend />
    </div>
  );
}
