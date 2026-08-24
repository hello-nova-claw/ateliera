import type {
  IdentityCardProjection,
  IdentityStudioProjection,
  StudioCardProjection,
} from '@studio/application';
import {
  identitySectionDefinitions,
  type IdentitySection,
} from '@studio/domain';
import { GuidedField, RoomHeading, SemanticMark } from '@studio/ui';
import { useId, useRef, useState } from 'react';

import './IdentityPage.css';
import { identityFieldGuidance, identityTitleGuidance } from './field-guidance';

type IdentityDraft = { body: string; title?: string };

export interface IdentityPageProps {
  error?: string;
  model: IdentityStudioProjection;
  offline?: boolean;
  onAdd: (section: IdentitySection, draft: IdentityDraft) => Promise<void>;
  onOpen: (card: StudioCardProjection, trigger: HTMLButtonElement) => void;
  onPromote: (noteId: string) => Promise<void>;
  onReorder: (section: IdentitySection, noteIds: string[]) => Promise<void>;
  state: 'ready' | 'loading' | 'stale' | 'error';
}

const addLabels: Record<IdentitySection, { noun: string; field: string }> = {
  'already-true': { noun: 'truth', field: 'What already feels true' },
  'practicing-now': { noun: 'practice', field: 'What I am practicing' },
  'values-principles': { noun: 'principle', field: 'Value or principle' },
  'desired-feelings': { noun: 'feeling', field: 'Desired feeling' },
  'beliefs-practice': { noun: 'belief', field: 'Belief in practice' },
  'embodiment-cues': { noun: 'cue', field: 'Embodiment cue' },
  'identity-shifts': { noun: 'shift', field: 'Identity shift' },
};

function humanDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return value;
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
}

function IdentityEvidence({
  card,
  onOpen,
}: {
  card: IdentityCardProjection;
  onOpen: IdentityPageProps['onOpen'];
}) {
  if (card.evidence.length === 0) return null;
  return (
    <div className="identity-card__evidence">
      <p>Evidence noticed</p>
      <ul>
        {card.evidence.map((evidence) => (
          <li key={evidence.noteId}>
            <span aria-hidden="true" className="identity-card__evidence-mark">
              ♥
            </span>
            <button
              aria-label={`Open evidence ${evidence.title}`}
              onClick={(event) => onOpen(evidence, event.currentTarget)}
              type="button"
            >
              <span>{evidence.title}</span>
              <time dateTime={evidence.created}>
                {humanDate(evidence.created)}
              </time>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function IdentityCard({
  busy,
  card,
  current,
  index,
  onOpen,
  onPromote,
  onReorder,
  section,
  total,
}: {
  busy: boolean;
  card: IdentityCardProjection;
  current: boolean;
  index: number;
  onOpen: IdentityPageProps['onOpen'];
  onPromote: IdentityPageProps['onPromote'];
  onReorder: (offset: -1 | 1) => void;
  section: IdentitySection;
  total: number;
}) {
  return (
    <article
      className={`identity-card identity-card--${card.semanticType}`}
      data-current={current}
    >
      <div className="identity-card__meaning">
        <SemanticMark type={card.semanticType} />
        <span>{current ? 'Currently becoming' : 'A note to return to'}</span>
      </div>
      <h3>{card.title}</h3>
      {card.excerpt !== '' && card.excerpt !== card.title && (
        <p>{card.excerpt}</p>
      )}
      <IdentityEvidence card={card} onOpen={onOpen} />
      <div className="identity-card__actions">
        <button
          aria-label={`Open ${card.title}`}
          disabled={busy}
          onClick={(event) => onOpen(card, event.currentTarget)}
          type="button"
        >
          Open
        </button>
        {section === 'practicing-now' && !current && (
          <button
            aria-label={`Make ${card.title} currently becoming`}
            disabled={busy}
            onClick={() => void onPromote(card.noteId).catch(() => undefined)}
            type="button"
          >
            Make current
          </button>
        )}
        {total > 1 && (
          <span
            className="identity-card__order"
            aria-label="Reorder this section"
          >
            <button
              aria-label={`Move ${card.title} up`}
              disabled={busy || index === 0}
              onClick={() => onReorder(-1)}
              type="button"
            >
              ↑
            </button>
            <button
              aria-label={`Move ${card.title} down`}
              disabled={busy || index === total - 1}
              onClick={() => onReorder(1)}
              type="button"
            >
              ↓
            </button>
          </span>
        )}
      </div>
    </article>
  );
}

function IdentityAddForm({
  busy,
  onAdd,
  onClose,
  section,
}: {
  busy: boolean;
  onAdd: IdentityPageProps['onAdd'];
  onClose: () => void;
  section: IdentitySection;
}) {
  const titleId = useId();
  const bodyId = useId();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const labels = addLabels[section];
  const guidance = identityFieldGuidance[section];
  return (
    <form
      className="identity-add-form"
      onSubmit={(event) => {
        event.preventDefault();
        const cleanBody = body.trim();
        const cleanTitle = title.trim();
        if (cleanBody === '') return;
        void onAdd(section, {
          body: cleanBody,
          ...(cleanTitle === '' ? {} : { title: cleanTitle }),
        }).catch(() => undefined);
      }}
    >
      <GuidedField
        controlId={titleId}
        description={identityTitleGuidance.description}
        label="A short title (optional)"
      >
        <input
          disabled={busy}
          id={titleId}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={identityTitleGuidance.example}
          value={title}
        />
      </GuidedField>
      <GuidedField
        controlId={bodyId}
        description={guidance.description}
        label={labels.field}
      >
        <textarea
          autoFocus
          disabled={busy}
          id={bodyId}
          onChange={(event) => setBody(event.target.value)}
          placeholder={guidance.example}
          rows={3}
          value={body}
        />
      </GuidedField>
      <div className="identity-add-form__actions">
        <button disabled={busy || body.trim() === ''} type="submit">
          {busy ? 'Remembering…' : `Remember this ${labels.noun}`}
        </button>
        <button disabled={busy} onClick={onClose} type="button">
          Not now
        </button>
      </div>
    </form>
  );
}

function IdentitySectionView({
  busyKey,
  cards,
  currentId,
  onAdd,
  onOpen,
  onPromote,
  onReorder,
  section,
}: {
  busyKey?: string;
  cards: IdentityCardProjection[];
  currentId?: string;
  onAdd: IdentityPageProps['onAdd'];
  onOpen: IdentityPageProps['onOpen'];
  onPromote: IdentityPageProps['onPromote'];
  onReorder: IdentityPageProps['onReorder'];
  section: (typeof identitySectionDefinitions)[number];
}) {
  const [adding, setAdding] = useState(false);
  const labels = addLabels[section.id];
  return (
    <section
      aria-labelledby={`identity-section-${section.id}`}
      className="identity-section"
      role="region"
    >
      <header className="identity-section__heading">
        <div>
          <h2 id={`identity-section-${section.id}`}>{section.label}</h2>
          <p>{section.prompt}</p>
        </div>
        {!adding && (
          <button
            disabled={busyKey !== undefined}
            onClick={() => setAdding(true)}
            type="button"
          >
            Add a {labels.noun}
          </button>
        )}
      </header>
      {adding && (
        <IdentityAddForm
          busy={busyKey !== undefined}
          onAdd={async (selected, draft) => {
            await onAdd(selected, draft);
            setAdding(false);
          }}
          onClose={() => setAdding(false)}
          section={section.id}
        />
      )}
      {cards.length === 0 && !adding ? (
        <p className="identity-section__empty">
          There is room for this to emerge.
        </p>
      ) : (
        <div className="identity-section__cards">
          {cards.map((card, index) => (
            <IdentityCard
              busy={busyKey !== undefined}
              card={card}
              current={card.noteId === currentId}
              index={index}
              key={card.noteId}
              onOpen={onOpen}
              onPromote={onPromote}
              onReorder={(offset) => {
                const next = cards.map((item) => item.noteId);
                const destination = index + offset;
                [next[index], next[destination]] = [
                  next[destination]!,
                  next[index]!,
                ];
                void onReorder(section.id, next).catch(() => undefined);
              }}
              section={section.id}
              total={cards.length}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function IdentityPage({
  error,
  model,
  offline = false,
  onAdd,
  onOpen,
  onPromote,
  onReorder,
  state,
}: IdentityPageProps) {
  const [busyKey, setBusyKey] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const mutationInFlight = useRef(false);

  async function perform(
    key: string,
    action: () => Promise<void>,
    success: string,
  ): Promise<void> {
    if (busyKey !== undefined || mutationInFlight.current) return;
    mutationInFlight.current = true;
    setBusyKey(key);
    setActionError(undefined);
    setMessage(undefined);
    try {
      await action();
      setMessage(success);
    } catch (reason) {
      setActionError(
        reason instanceof Error
          ? reason.message
          : 'This change could not be remembered yet.',
      );
      throw reason;
    } finally {
      mutationInFlight.current = false;
      setBusyKey(undefined);
    }
  }

  const empty = identitySectionDefinitions.every(
    (section) => model.sections[section.id].length === 0,
  );
  return (
    <div className="identity-page">
      <RoomHeading
        eyebrow="who I am, and who I am becoming"
        intro="Notice who you already are and who you're practising becoming — and keep the small, ordinary evidence that it's changing."
        title="Identity Studio"
        titleId="identity-studio-title"
      />

      {offline && (
        <p className="identity-page__notice" role="status">
          Stored locally. This room remains available offline.
        </p>
      )}
      {state === 'stale' && (
        <p className="identity-page__notice" role="status">
          Showing what is ready while Ateliera gathers recent changes.
        </p>
      )}
      {state === 'loading' && empty && (
        <p className="identity-page__state" role="status">
          Gathering this room…
        </p>
      )}
      {(error !== undefined || actionError !== undefined) && (
        <p className="identity-page__error" role="alert">
          {actionError ?? error}
        </p>
      )}
      {message !== undefined && (
        <p className="identity-page__message" role="status">
          {message}
        </p>
      )}

      <section
        aria-labelledby="identity-current-title"
        className="identity-current"
      >
        <p className="identity-current__eyebrow">Currently becoming</p>
        <h2 id="identity-current-title">
          {model.currentlyBecoming?.title ?? 'What are you practicing now?'}
        </h2>
        {model.currentlyBecoming === null ? (
          <p className="identity-current__copy">
            Choose any thought from Practicing now when one feels useful to meet
            again in the Foyer.
          </p>
        ) : (
          <>
            {model.currentlyBecoming.excerpt !== '' &&
              model.currentlyBecoming.excerpt !==
                model.currentlyBecoming.title && (
                <p className="identity-current__copy">
                  {model.currentlyBecoming.excerpt}
                </p>
              )}
            <IdentityEvidence card={model.currentlyBecoming} onOpen={onOpen} />
            <button
              aria-label={`Open ${model.currentlyBecoming.title}`}
              onClick={(event) =>
                onOpen(model.currentlyBecoming!, event.currentTarget)
              }
              type="button"
            >
              Open this thought
            </button>
          </>
        )}
        <small>This can change without becoming a measure of progress.</small>
      </section>

      <div className="identity-page__spread">
        <div className="identity-page__sections">
          {identitySectionDefinitions.map((section) => (
            <IdentitySectionView
              {...(busyKey === undefined ? {} : { busyKey })}
              cards={model.sections[section.id]}
              {...(model.currentlyBecoming === null
                ? {}
                : { currentId: model.currentlyBecoming.noteId })}
              key={section.id}
              onAdd={(selected, draft) =>
                perform(
                  `add:${selected}`,
                  () => onAdd(selected, draft),
                  'This thought is now part of your Studio.',
                )
              }
              onOpen={onOpen}
              onPromote={(noteId) =>
                perform(
                  `promote:${noteId}`,
                  () => onPromote(noteId),
                  'Currently becoming has been gently updated.',
                )
              }
              onReorder={(selected, noteIds) =>
                perform(
                  `reorder:${selected}`,
                  () => onReorder(selected, noteIds),
                  'This section has been rearranged.',
                )
              }
              section={section}
            />
          ))}
        </div>
        <aside className="identity-page__aside">
          <nav
            aria-label="Sections in this room"
            className="identity-index"
          >
            <p className="identity-index__eyebrow">In this room</p>
            <ul>
              {identitySectionDefinitions.map((section) => {
                const count = model.sections[section.id].length;
                return (
                  <li key={section.id}>
                    <a href={`#identity-section-${section.id}`}>
                      <span>{section.label}</span>
                      {count > 0 && (
                        <span className="identity-index__count">{count}</span>
                      )}
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>
      </div>
    </div>
  );
}
