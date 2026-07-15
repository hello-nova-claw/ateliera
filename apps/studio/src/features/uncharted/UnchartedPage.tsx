import type {
  UnchartedCardProjection,
  UnchartedProjection,
} from '@studio/application';
import { SemanticMark } from '@studio/ui';
import { useEffect, useRef, useState } from 'react';

import './UnchartedPage.css';
import type { TourExample } from '../onboarding/tour-examples';
import {
  TourExampleCard,
  TourGlimpseLabel,
  type UseTourExample,
} from '../onboarding/TourPreview';

export interface UnchartedPageProps {
  activeSeason?: { id: string; title: string };
  error?: string;
  model: UnchartedProjection;
  onCapture?: (
    body: string,
    horizon: 'near' | 'beyond',
  ) => Promise<void> | void;
  onInvite?: (card: UnchartedCardProjection) => Promise<void> | void;
  onOpen?: (card: UnchartedCardProjection, trigger: HTMLButtonElement) => void;
  state?: 'ready' | 'loading' | 'offline' | 'stale' | 'error';
  tourExamples?: readonly TourExample[];
  onUseTourExample?: UseTourExample;
}

function PossibilityCard({
  activeSeason,
  card,
  onInvite,
  onOpen,
}: {
  activeSeason?: UnchartedPageProps['activeSeason'];
  card: UnchartedCardProjection;
  onInvite?: UnchartedPageProps['onInvite'];
  onOpen?: UnchartedPageProps['onOpen'];
}) {
  const [message, setMessage] = useState<string>();
  const [inviting, setInviting] = useState(false);
  const invitePending = useRef(false);
  const inviteButton = useRef<HTMLButtonElement>(null);
  const restoreInviteFocus = useRef(false);
  const invited = activeSeason && card.seasons.includes(activeSeason.id);
  useEffect(() => {
    if (inviting || !restoreInviteFocus.current) return;
    restoreInviteFocus.current = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => inviteButton.current?.focus());
    });
  }, [card.hash, inviting]);
  return (
    <article
      className={`uncharted-card uncharted-card--${card.horizon}`}
      aria-labelledby={`uncharted-${card.noteId}`}
    >
      <div className="uncharted-card__meaning">
        <SemanticMark type="uncharted" />
      </div>
      <h3 id={`uncharted-${card.noteId}`}>{card.title}</h3>
      {card.excerpt && <p>{card.excerpt}</p>}
      <div className="uncharted-card__actions">
        {onOpen && (
          <button
            className="uncharted-page__text-action"
            onClick={(event) => onOpen(card, event.currentTarget)}
            type="button"
          >
            Open possibility
          </button>
        )}
        {activeSeason && onInvite && !invited && (
          <button
            className="uncharted-page__text-action"
            disabled={inviting}
            onClick={() => {
              if (invitePending.current) return;
              invitePending.current = true;
              setInviting(true);
              setMessage(undefined);
              void Promise.resolve(onInvite(card))
                .then(
                  () => {
                    setMessage(`Linked with ${activeSeason.title}.`);
                  },
                  (reason: unknown) => {
                    setMessage(
                      reason instanceof Error
                        ? reason.message
                        : 'This invitation could not be kept.',
                    );
                  },
                )
                .finally(() => {
                  invitePending.current = false;
                  restoreInviteFocus.current = true;
                  setInviting(false);
                });
            }}
            ref={inviteButton}
            type="button"
            aria-label={`Invite ${card.title} into ${activeSeason.title}`}
          >
            {inviting ? 'Inviting…' : 'Invite into this season'}
          </button>
        )}
        {activeSeason && invited && (
          <span className="uncharted-card__linked">
            Linked with {activeSeason.title}
          </span>
        )}
      </div>
      {message && (
        <p className="uncharted-card__message" role="status">
          {message}
        </p>
      )}
    </article>
  );
}

export function UnchartedPage({
  activeSeason,
  error,
  model,
  onCapture,
  onInvite,
  onOpen,
  onUseTourExample,
  state = 'ready',
  tourExamples = [],
}: UnchartedPageProps) {
  const [body, setBody] = useState('');
  const [beyond, setBeyond] = useState(false);
  const [captureMessage, setCaptureMessage] = useState<string>();
  const [saving, setSaving] = useState(false);
  const near = model.cards.filter((card) => card.horizon === 'near');
  const beyondCards = model.cards.filter((card) => card.horizon === 'beyond');
  const nearExample = tourExamples.find(
    (example) => example.previewKey === 'uncharted-near',
  );
  const beyondExample = tourExamples.find(
    (example) => example.previewKey === 'uncharted-beyond',
  );

  async function capture(): Promise<void> {
    if (!onCapture || body.trim() === '') return;
    setSaving(true);
    setCaptureMessage(undefined);
    try {
      await onCapture(body.trim(), beyond ? 'beyond' : 'near');
      setBody('');
      setBeyond(false);
      setCaptureMessage('Remembered.');
    } catch (reason) {
      setCaptureMessage(
        reason instanceof Error
          ? reason.message
          : 'This possibility could not be kept.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="uncharted-page">
      <header className="uncharted-page__header">
        <p className="uncharted-page__eyebrow">
          <SemanticMark type="uncharted" /> Uncharted
        </p>
        <h1>What if…?</h1>
        <p>
          A place for possibilities that do not need a route, an answer, or a
          reason yet.
        </p>
      </header>

      {state === 'loading' && (
        <p className="uncharted-page__state" role="status">
          Gathering Uncharted…
        </p>
      )}
      {state === 'offline' && (
        <p className="uncharted-page__state" role="status">
          Stored locally. This room remains available offline.
        </p>
      )}
      {state === 'stale' && (
        <p className="uncharted-page__state" role="status">
          Showing what is here while the Studio catches up.
        </p>
      )}
      {state === 'error' && (
        <p
          className="uncharted-page__state uncharted-page__state--error"
          role="alert"
        >
          {error ??
            'Uncharted could not be gathered. Your words remain in the Studio.'}
        </p>
      )}

      <form
        className="uncharted-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void capture();
        }}
      >
        <label htmlFor="uncharted-composer">What if…</label>
        <textarea
          id="uncharted-composer"
          onChange={(event) => setBody(event.target.value)}
          placeholder="Begin anywhere. You do not need to know what comes next."
          rows={5}
          value={body}
        />
        <div className="uncharted-composer__footer">
          <label className="uncharted-composer__gate">
            <input
              checked={beyond}
              onChange={(event) => setBeyond(event.target.checked)}
              type="checkbox"
            />
            Leave this beyond the gate
          </label>
          <button
            disabled={saving || body.trim() === '' || !onCapture}
            type="submit"
          >
            {saving ? 'Keeping…' : 'Keep this possibility'}
          </button>
        </div>
        {captureMessage && (
          <p className="uncharted-composer__message" role="status">
            {captureMessage}
          </p>
        )}
      </form>

      {tourExamples.length > 0 && <TourGlimpseLabel />}

      <section
        className="uncharted-page__near"
        aria-labelledby="near-possibilities"
      >
        <div className="uncharted-page__section-heading">
          <h2 id="near-possibilities">Near possibilities</h2>
          <p>Ideas close enough to glimpse, without asking anything of them.</p>
        </div>
        {near.length === 0 && !nearExample ? (
          <p className="uncharted-page__empty">
            There is room for whatever arrives.
          </p>
        ) : (
          <div className="uncharted-page__grid">
            {near.map((card) => (
              <PossibilityCard
                activeSeason={activeSeason}
                card={card}
                key={card.noteId}
                onInvite={onInvite}
                onOpen={onOpen}
              />
            ))}
            {nearExample && (
              <TourExampleCard
                className="uncharted-page__tour-example"
                example={nearExample}
                {...(onUseTourExample ? { onUse: onUseTourExample } : {})}
              />
            )}
          </div>
        )}
      </section>

      <section className="uncharted-page__beyond" aria-labelledby="beyond-gate">
        <div className="uncharted-page__gate-line" aria-hidden="true" />
        <div className="uncharted-page__section-heading uncharted-page__section-heading--beyond">
          <p className="uncharted-page__script">
            You do not have to know how yet.
          </p>
          <h2 id="beyond-gate">Beyond the gate</h2>
        </div>
        {beyondCards.length === 0 && !beyondExample ? (
          <p className="uncharted-page__empty">The gate can remain unopened.</p>
        ) : (
          <div className="uncharted-page__grid">
            {beyondCards.map((card) => (
              <PossibilityCard
                activeSeason={activeSeason}
                card={card}
                key={card.noteId}
                onInvite={onInvite}
                onOpen={onOpen}
              />
            ))}
            {beyondExample && (
              <TourExampleCard
                className="uncharted-page__tour-example"
                example={beyondExample}
              />
            )}
          </div>
        )}
      </section>
    </div>
  );
}
