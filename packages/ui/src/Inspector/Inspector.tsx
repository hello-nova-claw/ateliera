import type { StudioNote } from '@studio/domain';
import { useEffect, useRef, useState } from 'react';
import { Dialog } from '../Dialog/Dialog';
import { SemanticMark } from '../SemanticMark/SemanticMark';
import './Inspector.css';

export type InspectorState = 'ready' | 'loading' | 'error' | 'offline' | 'missing';

export interface InspectorNoteReference {
  id: string;
  path: string;
  title: string;
}

export interface InspectorForwardLink {
  occurrence: number;
  linkKind: 'wiki' | 'path' | 'id';
  target: string;
  label: string;
  start: number;
  end: number;
  state: 'resolved' | 'broken' | 'ambiguous';
  targetId?: string;
  candidateIds?: string[];
}

export interface InspectorResult {
  note: StudioNote;
  path: string;
  hash: string;
  backlinks: InspectorNoteReference[];
  forwardLinks: InspectorForwardLink[];
}

export interface InspectorOpenReference {
  direction: 'backlink' | 'forward';
  id: string;
  title: string;
  state: 'resolved';
  path?: string;
  occurrence?: number;
}

export interface InspectorProps {
  errorMessage?: string;
  isOpen: boolean;
  onClose: () => void;
  onOpenNote?: (reference: InspectorOpenReference) => unknown | Promise<unknown>;
  onRepairMissing?: () => unknown | Promise<unknown>;
  onReconnect?: () => unknown | Promise<unknown>;
  onRepairLink?: (link: InspectorForwardLink) => unknown | Promise<unknown>;
  onRestoreArchived?: (id: string) => unknown | Promise<unknown>;
  onRetry?: () => unknown | Promise<unknown>;
  result?: InspectorResult | null;
  state?: InspectorState;
}

type InspectorAction = () => unknown | Promise<unknown>;

function visibleTitle(note: StudioNote | undefined): string {
  const title = note?.title?.trim();
  return title ? title.replace(/<[^>]*>/gu, '').trim() || title : 'Untitled';
}

function formatLabel(value: string): string {
  return value.replaceAll('-', ' ');
}

function EmptyList({ children }: { children: string }) {
  return <p className="inspector__empty">{children}</p>;
}

export function Inspector({
  errorMessage,
  isOpen,
  onClose,
  onOpenNote,
  onRepairMissing,
  onReconnect,
  onRepairLink,
  onRestoreArchived,
  onRetry,
  result,
  state = 'ready',
}: InspectorProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [linksOpen, setLinksOpen] = useState(false);
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(new Set());
  const [actionError, setActionError] = useState<string>();
  const busy = useRef(new Set<string>());
  const pendingFocus = useRef<{ control: HTMLButtonElement; key: string } | undefined>(undefined);
  const note = result?.note;
  const title = visibleTitle(note);
  const viewState = state === 'ready' && !note ? 'missing' : state;

  useEffect(() => {
    setDetailsOpen(false);
    setLinksOpen(false);
    setActionError(undefined);
  }, [isOpen, note?.id]);

  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending || busyKeys.has(pending.key)) return;
    pendingFocus.current = undefined;
    if (pending.control.isConnected && !pending.control.disabled) pending.control.focus();
  }, [busyKeys]);

  async function runAction(
    key: string,
    action: InspectorAction,
    control: HTMLButtonElement,
  ): Promise<void> {
    if (busy.current.has(key)) return;
    busy.current.add(key);
    setBusyKeys(new Set(busy.current));
    setActionError(undefined);
    try {
      await action();
    } catch {
      setActionError('That action could not be completed. Nothing was changed; you can try again.');
    } finally {
      busy.current.delete(key);
      pendingFocus.current = { control, key };
      setBusyKeys(new Set(busy.current));
    }
  }

  function actionButton(
    key: string,
    label: string,
    action: InspectorAction,
    className = 'inspector__action',
  ) {
    const isBusy = busyKeys.has(key);
    return (
      <button
        aria-busy={isBusy || undefined}
        className={className}
        disabled={isBusy}
        onClick={(event) => void runAction(key, action, event.currentTarget)}
        type="button"
      >
        {label}
      </button>
    );
  }

  const dialogLabel = note ? `Inspect ${title}` : 'Note inspector';

  return (
    <Dialog isOpen={isOpen} label={dialogLabel} onClose={onClose} variant="inspector">
      <aside className="inspector" aria-label="Note details">
        <header className="inspector__header">
          <div className="inspector__heading">
            <p className="inspector__eyebrow">Note inspector</p>
            {note && <h2 className="inspector__title">{note.title?.trim() || 'Untitled'}</h2>}
          </div>
          <button aria-label="Close inspector" className="inspector__close" onClick={onClose} type="button">
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div className="inspector__content">
          {viewState === 'loading' && (
            <section className="inspector__state" role="status">
              <div aria-hidden="true" className="inspector__skeleton" />
              <h2>Opening this note…</h2>
              <p>Its words remain safely stored while the view is prepared.</p>
            </section>
          )}

          {viewState === 'error' && (
            <section className="inspector__state" role="alert">
              <h2>This note could not be opened.</h2>
              <p>{errorMessage ?? 'The Studio could not read it just now. Your source file has not been changed.'}</p>
              {onRetry && actionButton('retry', 'Try again', onRetry)}
            </section>
          )}

          {viewState === 'missing' && (
            <section className="inspector__state" role="status">
              <h2>This note is not here yet.</h2>
              <p>Search or repair its link. No surrounding words have been removed.</p>
              {onRepairMissing && actionButton('repair-missing', 'Search and repair links', onRepairMissing)}
            </section>
          )}

          {viewState === 'offline' && !note && (
            <section className="inspector__state" role="status">
              <h2>Stored locally</h2>
              <p>This note will be available again when its Studio reconnects.</p>
              {onReconnect && actionButton('reconnect', 'Reconnect', onReconnect)}
            </section>
          )}

          {note && viewState !== 'loading' && viewState !== 'error' && viewState !== 'missing' && (
            <>
              {viewState === 'offline' && (
                <section className="inspector__notice" role="status">
                  <div>
                    <strong>Stored locally</strong>
                    <p>You can keep reading. Links may need the Studio to reconnect.</p>
                  </div>
                  {onReconnect && actionButton('reconnect', 'Reconnect', onReconnect, 'inspector__quiet-action')}
                </section>
              )}

              <div className="inspector__meaning">
                <SemanticMark type={note.semanticType} />
                {note.status === 'archived' && <span className="inspector__status">Archived</span>}
              </div>

              <pre className="inspector__body">{note.body || 'This note has no written body yet.'}</pre>

              {note.status === 'archived' && (
                <section className="inspector__notice">
                  <div>
                    <strong>Archived</strong>
                    <p>This note is resting safely outside active rooms.</p>
                  </div>
                  {onRestoreArchived && actionButton(
                    `restore:${note.id}`,
                    'Restore note',
                    () => onRestoreArchived(note.id),
                    'inspector__quiet-action',
                  )}
                </section>
              )}

              <section className="inspector__disclosure">
                <button
                  aria-expanded={detailsOpen}
                  className="inspector__disclosure-trigger"
                  onClick={() => setDetailsOpen((open) => !open)}
                  type="button"
                >
                  <span>{detailsOpen ? 'Hide note details' : 'Show note details'}</span>
                  <span aria-hidden="true">{detailsOpen ? '−' : '+'}</span>
                </button>
                {detailsOpen && result && (
                  <dl className="inspector__metadata">
                    <div><dt>Path</dt><dd>{result.path}</dd></div>
                    <div><dt>Stable ID</dt><dd>{note.id}</dd></div>
                    <div><dt>Status</dt><dd>{formatLabel(note.status)}</dd></div>
                    <div><dt>Card type</dt><dd>{formatLabel(note.cardType)}</dd></div>
                    <div><dt>Created</dt><dd>{note.created}</dd></div>
                    <div><dt>Updated</dt><dd>{note.updated}</dd></div>
                    <div><dt>Privacy</dt><dd>{note.privacy.sensitivity}</dd></div>
                    <div><dt>AI access</dt><dd>{formatLabel(note.privacy.aiAccess)}</dd></div>
                    <div><dt>Rooms</dt><dd>{note.rooms.map(formatLabel).join(', ') || 'None'}</dd></div>
                    <div><dt>Life areas</dt><dd>{note.lifeAreas.map(formatLabel).join(', ') || 'None'}</dd></div>
                    <div><dt>Seasons</dt><dd>{note.seasons.join(', ') || 'None'}</dd></div>
                    <div><dt>Tags</dt><dd>{note.tags.join(', ') || 'None'}</dd></div>
                  </dl>
                )}
              </section>

              <section className="inspector__disclosure">
                <button
                  aria-expanded={linksOpen}
                  className="inspector__disclosure-trigger"
                  onClick={() => setLinksOpen((open) => !open)}
                  type="button"
                >
                  <span>{linksOpen ? 'Hide links' : 'Show links'}</span>
                  <span aria-hidden="true">{linksOpen ? '−' : '+'}</span>
                </button>
                {linksOpen && result && (
                  <div className="inspector__links">
                    <section aria-labelledby="inspector-backlinks-title">
                      <h3 id="inspector-backlinks-title">Linked from</h3>
                      {result.backlinks.length === 0 ? <EmptyList>No notes link here yet.</EmptyList> : (
                        <ul className="inspector__link-list">
                          {result.backlinks.map((backlink) => (
                            <li key={`backlink:${backlink.id}:${backlink.path}`}>
                              {onOpenNote ? actionButton(
                                `backlink:${backlink.id}:${backlink.path}`,
                                `Open ${backlink.title}`,
                                () => onOpenNote({
                                  direction: 'backlink', id: backlink.id, path: backlink.path,
                                  title: backlink.title, state: 'resolved',
                                }),
                                'inspector__link-action',
                              ) : <span className="inspector__link-label">{backlink.title}</span>}
                              <span className="inspector__link-identity">Backlink · {backlink.path}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>

                    <section aria-labelledby="inspector-forward-title">
                      <h3 id="inspector-forward-title">Links from this note</h3>
                      {result.forwardLinks.length === 0 ? <EmptyList>This note has no links yet.</EmptyList> : (
                        <ul className="inspector__link-list">
                          {result.forwardLinks.map((link) => {
                            const key = `forward:${link.occurrence}:${link.linkKind}:${link.target}`;
                            return (
                              <li key={key}>
                                {link.state === 'resolved' && link.targetId ? (
                                  onOpenNote ? actionButton(
                                    key,
                                    `Open ${link.label}`,
                                    () => onOpenNote({
                                      direction: 'forward', id: link.targetId!, occurrence: link.occurrence,
                                      title: link.label, state: 'resolved',
                                    }),
                                    'inspector__link-action',
                                  ) : <span className="inspector__link-label">{link.label}</span>
                                ) : (
                                  <>
                                    <div className="inspector__link-summary">
                                      <span>{link.label}</span>
                                      <span className={`inspector__link-state inspector__link-state--${link.state}`}>
                                        {link.state === 'broken' ? 'Broken link' : 'Choose a destination'}
                                      </span>
                                    </div>
                                    {link.state === 'ambiguous' && link.candidateIds && (
                                      <p className="inspector__candidates">
                                        Possible note IDs: {link.candidateIds.join(', ')}
                                      </p>
                                    )}
                                    {onRepairLink && actionButton(
                                      `repair:${key}`,
                                      link.state === 'broken'
                                        ? `Repair ${link.label}`
                                        : `Choose destination for ${link.label}`,
                                      () => onRepairLink(link),
                                      'inspector__quiet-action',
                                    )}
                                  </>
                                )}
                                <span className="inspector__link-identity">
                                  {formatLabel(link.state)} · {formatLabel(link.linkKind)} · occurrence {link.occurrence + 1}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </section>
                  </div>
                )}
              </section>
            </>
          )}

          {actionError && <p className="inspector__action-error" role="alert">{actionError}</p>}
        </div>
      </aside>
    </Dialog>
  );
}
