import type {
  ReflectionCardProjection,
  ReflectionGardenProjection,
  StudioCardProjection,
} from '@studio/application';
import { GuidedField, RoomHeading, SemanticMark } from '@studio/ui';
import { useEffect, useMemo, useRef, useState } from 'react';

import './ReflectionPage.css';
import { reflectionFieldGuidance } from './field-guidance';
import type { TourExample } from '../onboarding/tour-examples';
import { TourExampleCard, TourGlimpseLabel } from '../onboarding/TourPreview';

type ReflectionView = 'garden' | 'reflection' | 'celebration' | 'themes';
export type ReflectionConnection = {
  card?: StudioCardProjection;
  id: string;
  kind: 'note' | 'season' | 'life-area';
  label: string;
};

export interface ReflectionPageProps {
  connections?: ReflectionConnection[];
  error?: string;
  imageUnavailableIds?: ReadonlySet<string>;
  imageUrls?: Readonly<Record<string, string>>;
  model: ReflectionGardenProjection;
  onCapture?: (
    type: 'reflection' | 'celebration',
    body: string,
    openAfter: boolean,
    trigger: HTMLButtonElement,
  ) => Promise<void> | void;
  onConnect?: (
    card: ReflectionCardProjection,
    connection: ReflectionConnection,
  ) => Promise<void> | void;
  onOpenConnection?: (
    connection: ReflectionConnection,
    trigger: HTMLButtonElement,
  ) => Promise<void> | void;
  onOpen?: (card: ReflectionCardProjection, trigger: HTMLButtonElement) => void;
  state?: 'ready' | 'loading' | 'offline' | 'stale' | 'error';
  tourExamples?: readonly TourExample[];
}

function TourThenAndNow({ examples }: { examples: readonly TourExample[] }) {
  return (
    <section
      aria-label="Example Then and now"
      className="reflection-tour-pair"
      role="region"
    >
      <TourGlimpseLabel />
      <h2 className="reflection-page__eyebrow">Then &amp; now</h2>
      <div className="reflection-tour-pair__composition">
        {examples.map((example) => (
          <TourExampleCard example={example} key={example.previewKey} />
        ))}
      </div>
    </section>
  );
}

const views: Array<{ id: ReflectionView; label: string }> = [
  { id: 'garden', label: 'Garden' },
  { id: 'reflection', label: 'Reflection' },
  { id: 'celebration', label: 'Celebration' },
  { id: 'themes', label: 'Themes' },
];

function EntryCard({
  card,
  connections,
  imageUrl,
  imageUnavailable = false,
  onConnect,
  onOpenConnection,
  onOpen,
}: {
  card: ReflectionCardProjection;
  connections: ReflectionConnection[];
  imageUrl?: string;
  imageUnavailable?: boolean;
  onConnect?: ReflectionPageProps['onConnect'];
  onOpenConnection?: ReflectionPageProps['onOpenConnection'];
  onOpen?: ReflectionPageProps['onOpen'];
}) {
  const [connectionId, setConnectionId] = useState('');
  const [message, setMessage] = useState<string>();
  const [connecting, setConnecting] = useState(false);
  const [openingConnection, setOpeningConnection] = useState<string>();
  const connectionPending = useRef(false);
  const openingPending = useRef(false);
  const connectButton = useRef<HTMLButtonElement>(null);
  const restoreConnectionFocus = useRef(false);
  useEffect(() => {
    if (connecting || !restoreConnectionFocus.current) return;
    restoreConnectionFocus.current = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => connectButton.current?.focus());
    });
  }, [card.hash, connecting]);
  const available = connections.filter((candidate) => {
    if (candidate.kind === 'life-area')
      return !card.lifeAreas.includes(candidate.id);
    if (candidate.kind === 'season')
      return !card.seasons.includes(candidate.id);
    return (
      !card.linkedNoteIds.includes(candidate.id) && candidate.id !== card.noteId
    );
  });
  const evidence = card.evidenceConnections.map((item) => {
    const resolved = connections.find(
      (candidate) => candidate.kind === item.kind && candidate.id === item.id,
    );
    const label =
      ('label' in item ? item.label : undefined) ?? resolved?.label ?? item.id;
    if (item.targetState !== 'available') {
      const subject = item.kind === 'life-area' ? 'life area' : item.kind;
      return {
        ...item,
        label,
        repair:
          item.targetState === 'archived'
            ? item.kind === 'season'
              ? `The connected season ${label} is historical.`
              : `The connected ${subject} ${label} is archived.`
            : `The connected ${subject} ${item.id} is not available here.`,
      };
    }
    if (!resolved) {
      const subject = item.kind === 'life-area' ? 'life area' : item.kind;
      return {
        ...item,
        label,
        repair: `The connected ${subject} ${item.id} is not available here.`,
      };
    }
    return {
      ...item,
      label,
      connection: resolved ?? { id: item.id, kind: item.kind, label },
    };
  });
  const labelCounts = new Map<string, number>();
  for (const item of evidence) {
    labelCounts.set(item.label, (labelCounts.get(item.label) ?? 0) + 1);
  }
  return (
    <article
      aria-labelledby={`reflection-${card.noteId}`}
      className={`reflection-entry reflection-entry--${card.semanticType}`}
    >
      {imageUrl && (
        <figure className="reflection-entry__image">
          <span aria-hidden="true" className="reflection-entry__tape" />
          <img alt={card.title} src={imageUrl} />
        </figure>
      )}
      {imageUnavailable && (
        <p className="reflection-entry__image-repair">
          This image is not available here. The entry remains intact.
        </p>
      )}
      <div className="reflection-entry__meaning">
        <SemanticMark labelMode="visible" type={card.semanticType} />
      </div>
      <h3 id={`reflection-${card.noteId}`}>{card.title}</h3>
      {card.excerpt && <p>{card.excerpt}</p>}
      {evidence.length > 0 && (
        <ul
          aria-label={`Connections for ${card.title}`}
          className="reflection-entry__connections"
        >
          {evidence.map((item) => (
            <li key={`${item.kind}:${item.id}`}>
              {'repair' in item ? (
                <span className="reflection-entry__connection-repair">
                  {item.repair}
                </span>
              ) : onOpenConnection && item.connection ? (
                <button
                  aria-label={`Open ${item.label}, ${item.id}`}
                  disabled={openingConnection !== undefined}
                  onClick={(event) => {
                    if (openingPending.current) return;
                    const trigger = event.currentTarget;
                    openingPending.current = true;
                    setOpeningConnection(`${item.kind}:${item.id}`);
                    setMessage(undefined);
                    void Promise.resolve(
                      onOpenConnection(item.connection, trigger),
                    )
                      .catch((reason: unknown) => {
                        setMessage(
                          reason instanceof Error
                            ? reason.message
                            : 'This connection is no longer available.',
                        );
                      })
                      .finally(() => {
                        openingPending.current = false;
                        setOpeningConnection(undefined);
                        requestAnimationFrame(() => {
                          requestAnimationFrame(() => trigger.focus());
                        });
                      });
                  }}
                  type="button"
                >
                  {item.label}
                  {(labelCounts.get(item.label) ?? 0) > 1 && (
                    <span> · {item.id}</span>
                  )}
                </button>
              ) : (
                item.label
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="reflection-entry__actions">
        {onOpen && (
          <button
            onClick={(event) => onOpen(card, event.currentTarget)}
            type="button"
          >
            Open entry
          </button>
        )}
        {onConnect && available.length > 0 && (
          <form
            className="reflection-entry__connect"
            onSubmit={(event) => {
              event.preventDefault();
              if (connectionPending.current) return;
              const connection = available.find(
                (candidate) =>
                  `${candidate.kind}:${candidate.id}` === connectionId,
              );
              if (!connection) return;
              connectionPending.current = true;
              setConnecting(true);
              setMessage(undefined);
              void Promise.resolve(onConnect(card, connection))
                .then(
                  () => {
                    setMessage(`Connected with ${connection.label}.`);
                    setConnectionId('');
                  },
                  (reason: unknown) => {
                    setMessage(
                      reason instanceof Error
                        ? reason.message
                        : 'This connection could not be kept.',
                    );
                  },
                )
                .finally(() => {
                  connectionPending.current = false;
                  restoreConnectionFocus.current = true;
                  setConnecting(false);
                });
            }}
          >
            <label htmlFor={`connect-${card.noteId}`}>Connect evidence</label>
            <select
              id={`connect-${card.noteId}`}
              disabled={connecting}
              onChange={(event) => setConnectionId(event.target.value)}
              value={connectionId}
            >
              <option value="">Choose a connection</option>
              {available.map((connection) => (
                <option
                  key={`${connection.kind}:${connection.id}`}
                  value={`${connection.kind}:${connection.id}`}
                >
                  {connection.label}
                </option>
              ))}
            </select>
            <button
              disabled={connecting || connectionId === ''}
              ref={connectButton}
              type="submit"
            >
              {connecting ? 'Connecting…' : 'Connect'}
            </button>
          </form>
        )}
      </div>
      {message && (
        <p className="reflection-entry__message" role="status">
          {message}
        </p>
      )}
    </article>
  );
}

function ThenAndNow({ cards }: { cards: ReflectionCardProjection[] }) {
  const byId = new Map(cards.map((card) => [card.noteId, card]));
  const pair = cards
    .map((now) => ({
      now,
      then: now.thenNoteId ? byId.get(now.thenNoteId) : undefined,
    }))
    .find((item) => item.then !== undefined);
  if (!pair?.then) return null;
  return (
    <section aria-label="Then and now" className="reflection-then-now">
      <h2 className="reflection-page__eyebrow">Then &amp; now</h2>
      <div className="reflection-then-now__pair">
        <article>
          <span>Then</span>
          <h3>{pair.then.title}</h3>
          <p>{pair.then.excerpt}</p>
        </article>
        <span aria-hidden="true" className="reflection-then-now__line" />
        <article>
          <span>Now</span>
          <h3>{pair.now.title}</h3>
          <p>{pair.now.excerpt}</p>
        </article>
      </div>
    </section>
  );
}

export function ReflectionPage({
  connections = [],
  error,
  imageUnavailableIds = new Set(),
  imageUrls = {},
  model,
  onCapture,
  onConnect,
  onOpenConnection,
  onOpen,
  state = 'ready',
  tourExamples = [],
}: ReflectionPageProps) {
  const [view, setView] = useState<ReflectionView>('garden');
  const [theme, setTheme] = useState<string>();
  const [body, setBody] = useState('');
  const [type, setType] = useState<'reflection' | 'celebration'>('reflection');
  const [message, setMessage] = useState<string>();
  const [saving, setSaving] = useState(false);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const filtered = useMemo(() => {
    if (view === 'reflection' || view === 'celebration') {
      return model.cards.filter((card) => card.semanticType === view);
    }
    if (view === 'themes' && theme) {
      return model.cards.filter((card) => card.tags.includes(theme));
    }
    return model.cards;
  }, [model.cards, theme, view]);
  const viewCounts = useMemo<Record<ReflectionView, number>>(
    () => ({
      garden: model.cards.length,
      reflection: model.cards.filter(
        (card) => card.semanticType === 'reflection',
      ).length,
      celebration: model.cards.filter(
        (card) => card.semanticType === 'celebration',
      ).length,
      themes: model.themes.length,
    }),
    [model.cards, model.themes],
  );

  async function capture(
    openAfter: boolean,
    trigger: HTMLButtonElement,
  ): Promise<void> {
    if (!onCapture || body.trim() === '') return;
    setSaving(true);
    setMessage(undefined);
    try {
      await onCapture(type, body.trim(), openAfter, trigger);
      setBody('');
      setMessage('Remembered.');
    } catch (reason) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : 'This entry could not be kept.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="reflection-page">
      <div className="reflection-page__header">
        <RoomHeading
          eyebrow="notice what is changing"
          intro="Gather what you're learning and celebrating, so the Studio remembers with you."
          title="Reflection Garden"
        />
      </div>

      {state === 'loading' && (
        <p className="reflection-page__state" role="status">
          Gathering the garden…
        </p>
      )}
      {state === 'offline' && (
        <p className="reflection-page__state" role="status">
          Stored locally. The garden remains available offline.
        </p>
      )}
      {state === 'stale' && (
        <p className="reflection-page__state" role="status">
          Showing what is here while the Studio catches up.
        </p>
      )}
      {state === 'error' && (
        <p
          className="reflection-page__state reflection-page__state--error"
          role="alert"
        >
          {error ??
            'The garden could not be gathered. Your entries remain in the Studio.'}
        </p>
      )}

      <div className="reflection-page__spread">
        <aside
          aria-label="Reflection Garden views"
          className="reflection-page__aside"
        >
          <div
            aria-label="Reflection Garden view"
            className="reflection-switch"
            role="tablist"
          >
            {views.map((item, index) => (
              <button
                aria-label={item.label}
                aria-selected={view === item.id}
                className="reflection-switch__tab"
                key={item.id}
                onClick={() => {
                  setView(item.id);
                  if (item.id !== 'themes') setTheme(undefined);
                }}
                onKeyDown={(event) => {
                  let next = index;
                  if (event.key === 'ArrowDown' || event.key === 'ArrowRight')
                    next = (index + 1) % views.length;
                  else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft')
                    next = (index - 1 + views.length) % views.length;
                  else if (event.key === 'Home') next = 0;
                  else if (event.key === 'End') next = views.length - 1;
                  else return;
                  event.preventDefault();
                  setView(views[next]!.id);
                  tabRefs.current[next]?.focus();
                }}
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                role="tab"
                tabIndex={view === item.id ? 0 : -1}
                type="button"
              >
                <span>{item.label}</span>
                {viewCounts[item.id] > 0 && (
                  <span aria-hidden="true" className="reflection-switch__count">
                    {viewCounts[item.id]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </aside>

        <div className="reflection-page__main">
          <form
            className="reflection-capture"
            onSubmit={(event) => {
              event.preventDefault();
              void capture(
                false,
                event.nativeEvent.submitter as HTMLButtonElement,
              );
            }}
          >
            <div className="reflection-capture__heading">
              <GuidedField
                controlId="reflection-sentence"
                description={reflectionFieldGuidance.sentenceToKeep.description}
                label="A sentence to keep"
              >
                <textarea
                  id="reflection-sentence"
                  onChange={(event) => setBody(event.target.value)}
                  placeholder={reflectionFieldGuidance.sentenceToKeep.example}
                  rows={2}
                  value={body}
                />
              </GuidedField>
              <select
                aria-label="Entry meaning"
                onChange={(event) => setType(event.target.value as typeof type)}
                value={type}
              >
                <option value="reflection">Reflection</option>
                <option value="celebration">Celebration</option>
              </select>
            </div>
            <div className="reflection-capture__actions">
              <button
                disabled={saving || body.trim() === '' || !onCapture}
                type="submit"
              >
                {saving ? 'Keeping…' : `Keep ${type}`}
              </button>
              <button
                disabled={saving || body.trim() === '' || !onCapture}
                onClick={(event) => void capture(true, event.currentTarget)}
                type="button"
              >
                Continue in the editor
              </button>
            </div>
            {message && (
              <p className="reflection-capture__message" role="status">
                {message}
              </p>
            )}
          </form>

          {view === 'garden' && tourExamples.length > 0 && (
            <TourThenAndNow examples={tourExamples} />
          )}

          {view === 'themes' && (
            <section className="reflection-themes" aria-label="Themes">
              {model.themes.length === 0 ? (
                <p>Recurring ideas will gather here gently.</p>
              ) : (
                model.themes.map((item) => (
                  <button
                    aria-pressed={theme === item.name}
                    key={item.name}
                    onClick={() => setTheme(item.name)}
                    type="button"
                    aria-label={`${item.name}, ${item.count} ${item.count === 1 ? 'entry' : 'entries'}`}
                  >
                    {item.name} <span>{item.count}</span>
                  </button>
                ))
              )}
            </section>
          )}

          {view === 'garden' && <ThenAndNow cards={model.cards} />}

          <section
            aria-labelledby="reflection-stream-title"
            className="reflection-stream"
          >
            <h2 className="visually-hidden" id="reflection-stream-title">
              Garden entries
            </h2>
            {filtered.length === 0 ? (
              <p className="reflection-stream__empty">
                There is room to notice something small.
              </p>
            ) : (
              filtered.map((card) => (
                <div className="reflection-stream__row" key={card.noteId}>
                  <time dateTime={card.created}>
                    {new Intl.DateTimeFormat('en-AU', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    }).format(new Date(card.created))}
                  </time>
                  <EntryCard
                    card={card}
                    connections={connections}
                    {...(imageUrls[card.noteId] === undefined
                      ? {}
                      : { imageUrl: imageUrls[card.noteId] })}
                    imageUnavailable={imageUnavailableIds.has(card.noteId)}
                    {...(onConnect === undefined ? {} : { onConnect })}
                    {...(onOpenConnection === undefined
                      ? {}
                      : { onOpenConnection })}
                    {...(onOpen === undefined ? {} : { onOpen })}
                  />
                </div>
              ))
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
