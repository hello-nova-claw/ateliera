import type {
  CaptureNoteInput,
  WisdomCardProjection,
  WisdomGardenProjection,
  WisdomThemePreference,
} from '@studio/application';
import { wisdomKinds, type WisdomKind } from '@studio/domain';
import { RoomHeading } from '@studio/ui';
import { useEffect, useMemo, useRef, useState } from 'react';

import './WisdomPage.css';

export interface WisdomPageProps {
  error?: string;
  model: WisdomGardenProjection;
  onCapture?: (input: CaptureNoteInput) => Promise<unknown>;
  onOpen?: (card: WisdomCardProjection, trigger: HTMLButtonElement) => void;
  onSaveThemes?: (themes: readonly WisdomThemePreference[]) => Promise<void>;
  state?: 'ready' | 'loading' | 'stale' | 'offline' | 'repair' | 'error';
  themes: readonly WisdomThemePreference[];
}

const kindLabels: Record<WisdomKind, string> = {
  insight: 'Insight',
  quote: 'Quote',
  principle: 'Principle',
  practice: 'Practice',
  question: 'Question',
  resource: 'Book, course or podcast',
  synthesis: 'Synthesis',
};

function wikiTitle(title: string): string {
  return title.replaceAll('[', '').replaceAll(']', '').trim() || 'Untitled';
}

function sourceLabel(card: WisdomCardProjection): string | undefined {
  const values = [card.source?.creator, card.source?.title].filter(Boolean);
  return values.length > 0 ? values.join(' · ') : undefined;
}

function safeUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

function slug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLocaleLowerCase('en')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '');
}

export function WisdomPage({
  error,
  model,
  onCapture,
  onOpen,
  onSaveThemes,
  state = 'ready',
  themes,
}: WisdomPageProps) {
  const visibleThemes = useMemo(
    () =>
      themes.filter((theme) => !theme.hidden).sort((a, b) => a.order - b.order),
    [themes],
  );
  const [activeTheme, setActiveTheme] = useState(visibleThemes[0]?.id ?? '');
  const [selected, setSelected] = useState<string[]>([]);
  const [synthesizing, setSynthesizing] = useState(false);
  const [synthesisTitle, setSynthesisTitle] = useState('');
  const [synthesisBody, setSynthesisBody] = useState('');
  const [makingMine, setMakingMine] = useState(false);
  const [mineBody, setMineBody] = useState('');
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newKind, setNewKind] = useState<WisdomKind>('insight');
  const [sourceCreator, setSourceCreator] = useState('');
  const [sourceTitle, setSourceTitle] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [editingThemes, setEditingThemes] = useState(false);
  const [themeDrafts, setThemeDrafts] = useState<WisdomThemePreference[]>([
    ...themes,
  ]);
  const [newTheme, setNewTheme] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [messageIsError, setMessageIsError] = useState(false);
  const mutationInFlight = useRef(false);

  useEffect(() => {
    if (
      activeTheme !== '' &&
      !visibleThemes.some((theme) => theme.id === activeTheme)
    )
      setActiveTheme(visibleThemes[0]?.id ?? '');
  }, [activeTheme, visibleThemes]);
  useEffect(() => {
    if (!editingThemes) setThemeDrafts([...themes]);
  }, [editingThemes, themes]);

  const activeThemeTitle =
    activeTheme === ''
      ? 'All ideas'
      : (themes.find((theme) => theme.id === activeTheme)?.title ??
        'All ideas');
  const cards =
    activeTheme === ''
      ? model.cards
      : model.cards.filter((card) => card.themes.includes(activeTheme));
  const selectedCards = selected.flatMap((id) => {
    const card = model.cards.find((candidate) => candidate.noteId === id);
    return card ? [card] : [];
  });

  async function keep(
    input: CaptureNoteInput,
    after: () => void,
  ): Promise<void> {
    if (!onCapture || mutationInFlight.current) return;
    mutationInFlight.current = true;
    setBusy(true);
    setMessage(undefined);
    setMessageIsError(false);
    try {
      await onCapture(input);
      after();
      setMessage('Kept in the garden.');
    } catch (reason) {
      setMessageIsError(true);
      setMessage(
        reason instanceof Error
          ? reason.message
          : 'This idea could not be kept.',
      );
    } finally {
      mutationInFlight.current = false;
      setBusy(false);
    }
  }

  async function keepSynthesis(): Promise<void> {
    const links = selectedCards
      .map(
        (card) =>
          `- [${wikiTitle(card.title)}](studio://note/${encodeURIComponent(card.noteId)})`,
      )
      .join('\n');
    await keep(
      {
        body: `${synthesisBody.trim()}\n\n## Source notes\n\n${links}`,
        title: synthesisTitle.trim(),
        wisdom: {
          kind: 'synthesis',
          themes: activeTheme ? [activeTheme] : [],
          sourceNoteIds: selectedCards.map((card) => card.noteId),
        },
      },
      () => {
        setSelected([]);
        setSynthesizing(false);
        setSynthesisTitle('');
        setSynthesisBody('');
      },
    );
  }

  async function keepNewIdea(): Promise<void> {
    const source = {
      ...(sourceTitle.trim() ? { title: sourceTitle.trim() } : {}),
      ...(sourceCreator.trim() ? { creator: sourceCreator.trim() } : {}),
      ...(sourceUrl.trim() ? { url: sourceUrl.trim() } : {}),
    };
    await keep(
      {
        body: newBody.trim(),
        ...(newTitle.trim() ? { title: newTitle.trim() } : {}),
        wisdom: {
          kind: newKind,
          themes: activeTheme ? [activeTheme] : [],
          ...(Object.keys(source).length === 0 ? {} : { source }),
        },
      },
      () => {
        setAdding(false);
        setNewTitle('');
        setNewBody('');
        setSourceCreator('');
        setSourceTitle('');
        setSourceUrl('');
      },
    );
  }

  async function saveThemeDrafts(): Promise<void> {
    if (!onSaveThemes || mutationInFlight.current) return;
    mutationInFlight.current = true;
    setBusy(true);
    setMessage(undefined);
    setMessageIsError(false);
    try {
      await onSaveThemes(themeDrafts);
      setEditingThemes(false);
      setMessage('Theme contents updated.');
    } catch (reason) {
      setMessageIsError(true);
      setMessage(
        reason instanceof Error
          ? reason.message
          : 'Themes could not be updated.',
      );
    } finally {
      mutationInFlight.current = false;
      setBusy(false);
    }
  }

  function addTheme(): void {
    const title = newTheme.trim();
    const base = slug(title);
    if (!title || !base) return;
    let id = base;
    let suffix = 2;
    while (themeDrafts.some((theme) => theme.id === id))
      id = `${base}-${suffix++}`;
    setThemeDrafts((current) => [
      ...current,
      { id, title, hidden: false, order: current.length },
    ]);
    setNewTheme('');
  }

  return (
    <div className="wisdom-page">
      <RoomHeading
        eyebrow="ideas becoming your own"
        intro="Gather what resonates by theme, keep its source, and let your own philosophy take shape between the lines."
        title="Wisdom Garden"
      />

      {state !== 'ready' && (
        <p
          className={`wisdom-page__state${state === 'error' || state === 'repair' ? ' wisdom-page__state--attention' : ''}`}
          role={state === 'error' ? 'alert' : 'status'}
        >
          {state === 'loading' && 'Gathering the Wisdom Garden…'}
          {state === 'offline' &&
            'Stored locally. The garden remains available offline.'}
          {state === 'stale' &&
            'Showing what is here while the Studio catches up.'}
          {state === 'repair' &&
            (error ?? 'Some Wisdom Garden settings need repair.')}
          {state === 'error' &&
            (error ?? 'The Wisdom Garden could not be gathered.')}
        </p>
      )}

      <div className="wisdom-page__layout">
        <aside className="wisdom-contents" aria-label="Wisdom themes">
          <div className="wisdom-contents__heading">
            <p>Contents</p>
            <button
              disabled={
                state === 'repair' || state === 'error' || state === 'loading'
              }
              onClick={() => setEditingThemes((value) => !value)}
              type="button"
            >
              {editingThemes ? 'Close' : 'Edit themes'}
            </button>
          </div>
          <div className="wisdom-contents__themes">
            <button
              aria-current={activeTheme === '' ? 'page' : undefined}
              className="wisdom-contents__theme"
              onClick={() => {
                setActiveTheme('');
                setSelected([]);
              }}
              type="button"
            >
              All ideas
            </button>
            {visibleThemes.map((theme) => (
              <button
                aria-current={activeTheme === theme.id ? 'page' : undefined}
                className="wisdom-contents__theme"
                key={theme.id}
                onClick={() => {
                  setActiveTheme(theme.id);
                  setSelected([]);
                }}
                type="button"
              >
                {theme.title}
              </button>
            ))}
          </div>
        </aside>

        <section aria-label="Wisdom reading" className="wisdom-reading">
          {editingThemes && (
            <section
              aria-label="Edit Wisdom themes"
              className="wisdom-theme-editor"
            >
              <header>
                <div>
                  <p className="wisdom-page__eyebrow">Your contents</p>
                  <h2>Edit themes</h2>
                </div>
                <p>
                  Rename or rest a theme. Existing notes keep their words and
                  tags.
                </p>
              </header>
              <div className="wisdom-theme-editor__list">
                {themeDrafts.map((theme, index) => (
                  <div className="wisdom-theme-editor__row" key={theme.id}>
                    <input
                      aria-label={`Theme ${index + 1}`}
                      disabled={busy}
                      onChange={(event) =>
                        setThemeDrafts((current) =>
                          current.map((item) =>
                            item.id === theme.id
                              ? { ...item, title: event.target.value }
                              : item,
                          ),
                        )
                      }
                      value={theme.title}
                    />
                    <label>
                      <input
                        checked={theme.hidden}
                        disabled={busy}
                        onChange={(event) =>
                          setThemeDrafts((current) =>
                            current.map((item) =>
                              item.id === theme.id
                                ? { ...item, hidden: event.target.checked }
                                : item,
                            ),
                          )
                        }
                        type="checkbox"
                      />
                      Rest
                    </label>
                  </div>
                ))}
              </div>
              <div className="wisdom-theme-editor__add">
                <label htmlFor="wisdom-new-theme">New theme</label>
                <input
                  disabled={busy}
                  id="wisdom-new-theme"
                  onChange={(event) => setNewTheme(event.target.value)}
                  value={newTheme}
                />
                <button
                  disabled={busy || !newTheme.trim()}
                  onClick={addTheme}
                  type="button"
                >
                  Add theme
                </button>
              </div>
              <div className="wisdom-page__actions">
                <button
                  disabled={
                    busy || themeDrafts.some((theme) => !theme.title.trim())
                  }
                  onClick={() => void saveThemeDrafts()}
                  type="button"
                >
                  {busy ? 'Saving…' : 'Save themes'}
                </button>
              </div>
            </section>
          )}

          <header className="wisdom-reading__heading">
            <div>
              <span aria-hidden="true" />
              <h2>{activeThemeTitle}</h2>
            </div>
            <button
              disabled={busy || state === 'loading'}
              onClick={() => setAdding((value) => !value)}
              type="button"
            >
              {adding ? 'Close' : 'Add an idea'}
            </button>
          </header>

          {adding && (
            <section className="wisdom-composer" aria-label="Add a Wisdom note">
              <div className="wisdom-composer__pair">
                <label>
                  Kind
                  <select
                    disabled={busy}
                    onChange={(event) =>
                      setNewKind(event.target.value as WisdomKind)
                    }
                    value={newKind}
                  >
                    {wisdomKinds.map((kind) => (
                      <option key={kind} value={kind}>
                        {kindLabels[kind]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Title (optional)
                  <input
                    disabled={busy}
                    onChange={(event) => setNewTitle(event.target.value)}
                    value={newTitle}
                  />
                </label>
              </div>
              <label>
                Idea
                <textarea
                  disabled={busy}
                  onChange={(event) => setNewBody(event.target.value)}
                  rows={4}
                  value={newBody}
                />
              </label>
              <details>
                <summary>Source details</summary>
                <div className="wisdom-composer__source">
                  <label>
                    Creator
                    <input
                      disabled={busy}
                      onChange={(event) => setSourceCreator(event.target.value)}
                      value={sourceCreator}
                    />
                  </label>
                  <label>
                    Book, course or episode
                    <input
                      disabled={busy}
                      onChange={(event) => setSourceTitle(event.target.value)}
                      value={sourceTitle}
                    />
                  </label>
                  <label>
                    Source URL
                    <input
                      disabled={busy}
                      inputMode="url"
                      onChange={(event) => setSourceUrl(event.target.value)}
                      value={sourceUrl}
                    />
                  </label>
                </div>
              </details>
              <div className="wisdom-page__actions">
                <button
                  disabled={busy || !newBody.trim() || !onCapture}
                  onClick={() => void keepNewIdea()}
                  type="button"
                >
                  Keep idea
                </button>
              </div>
            </section>
          )}

          {cards.length === 0 ? (
            <div className="wisdom-reading__empty">
              <p>Begin with one idea worth returning to.</p>
              <button
                disabled={!onCapture || state === 'loading'}
                onClick={() => setAdding(true)}
                type="button"
              >
                Add the first idea
              </button>
            </div>
          ) : (
            <div className="wisdom-reading__cards">
              {cards.map((card) => {
                const source = sourceLabel(card);
                const url = safeUrl(card.source?.url);
                const checked = selected.includes(card.noteId);
                return (
                  <article
                    className={`wisdom-card${checked ? ' wisdom-card--selected' : ''}`}
                    key={card.noteId}
                  >
                    <div className="wisdom-card__topline">
                      <p>
                        {kindLabels[card.cardType as WisdomKind] ??
                          card.cardType}
                      </p>
                      <label>
                        <input
                          aria-label={`Select ${card.title}`}
                          checked={checked}
                          onChange={(event) =>
                            setSelected((current) =>
                              event.target.checked
                                ? [...current, card.noteId]
                                : current.filter((id) => id !== card.noteId),
                            )
                          }
                          type="checkbox"
                        />
                        Select
                      </label>
                    </div>
                    <button
                      className="wisdom-card__open"
                      onClick={(event) => onOpen?.(card, event.currentTarget)}
                      type="button"
                      aria-label={`Open ${card.title}`}
                    >
                      <span className="wisdom-card__title">{card.title}</span>
                      {card.excerpt && (
                        <span className="wisdom-card__excerpt">
                          {card.excerpt}
                        </span>
                      )}
                    </button>
                    {source && (
                      <p className="wisdom-card__source">
                        {url ? (
                          <a href={url} rel="noreferrer" target="_blank">
                            {source}
                          </a>
                        ) : (
                          source
                        )}
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          {selected.length > 0 && !synthesizing && (
            <div className="wisdom-selection" role="status">
              <span className="wisdom-selection__thread" aria-hidden="true" />
              <p>These ideas are ready to meet.</p>
              <button onClick={() => setSynthesizing(true)} type="button">
                Synthesize {selected.length} notes
              </button>
            </div>
          )}

          {synthesizing && (
            <section
              className="wisdom-synthesis"
              aria-labelledby="wisdom-synthesis-title"
            >
              <p className="wisdom-page__eyebrow">Draw the thread together</p>
              <h2 id="wisdom-synthesis-title">A synthesis in your own words</h2>
              <label>
                Synthesis title
                <input
                  disabled={busy}
                  onChange={(event) => setSynthesisTitle(event.target.value)}
                  value={synthesisTitle}
                />
              </label>
              <label>
                What connects these ideas?
                <textarea
                  disabled={busy}
                  onChange={(event) => setSynthesisBody(event.target.value)}
                  rows={5}
                  value={synthesisBody}
                />
              </label>
              <ul>
                {selectedCards.map((card) => (
                  <li key={card.noteId}>{card.title}</li>
                ))}
              </ul>
              <div className="wisdom-page__actions">
                <button onClick={() => setSynthesizing(false)} type="button">
                  Not now
                </button>
                <button
                  disabled={
                    busy || !synthesisTitle.trim() || !synthesisBody.trim()
                  }
                  onClick={() => void keepSynthesis()}
                  type="button"
                >
                  Keep synthesis
                </button>
              </div>
            </section>
          )}

          <section className="wisdom-mine">
            <div>
              <p className="wisdom-mine__script">make it mine</p>
              <p>
                What do I believe? What have I observed? How would this fit my
                actual life?
              </p>
            </div>
            {!makingMine ? (
              <button onClick={() => setMakingMine(true)} type="button">
                Make it mine
              </button>
            ) : (
              <div className="wisdom-mine__composer">
                <label>
                  What do you believe?
                  <textarea
                    autoFocus
                    disabled={busy}
                    onChange={(event) => setMineBody(event.target.value)}
                    rows={4}
                    value={mineBody}
                  />
                </label>
                <div className="wisdom-page__actions">
                  <button onClick={() => setMakingMine(false)} type="button">
                    Not now
                  </button>
                  <button
                    disabled={busy || !mineBody.trim()}
                    onClick={() =>
                      void keep(
                        {
                          body: mineBody.trim(),
                          title: `What I believe about ${activeThemeTitle}`,
                          wisdom: {
                            kind: 'insight',
                            themes: activeTheme ? [activeTheme] : [],
                          },
                        },
                        () => {
                          setMakingMine(false);
                          setMineBody('');
                        },
                      )
                    }
                    type="button"
                  >
                    Keep my response
                  </button>
                </div>
              </div>
            )}
          </section>
          {message && (
            <p
              className={`wisdom-page__message${messageIsError ? ' wisdom-page__message--error' : ''}`}
              role={messageIsError ? 'alert' : 'status'}
            >
              {message}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
